# Audit bugs — 2026-07 (chasse adversariale « bugs intermittents »)

Contexte : users remontent des bugs « aléatoires, non reproductibles ». Audit ciblé
dates/timezones, concurrence, YAML, release.ts, roadmap.ts, api.ts. Chaque bug
ci-dessous a un mécanisme démontré (fichier:ligne) et une repro concrète.
La repro du bug 1 a été **exécutée** (script + log inclus).

---

## Bugs confirmés — sévérité HAUTE (intégrité des données)

### 1. `withLock` : le verrou peut être tenu par deux écrivains en même temps

**Fichiers** : `src/lib/taskWrites.ts:133-137` (vol), `:149-154` (release sans contrôle de propriété).

**Mécanismes** (deux, même cause racine : ni le vol ni le release ne vérifient la propriété) :

- **(a) Vol d'un verrou VIVANT** : l'`owner` (`pid:timestamp`) est écrit une fois à
  l'acquisition et jamais rafraîchi pendant `fn()`. Si `fn()` dure plus que le TTL
  (10 s — atteignable : gros tree + `validateAll` qui re-parse tout docs/tasks/ deux
  fois par commit, disque lent, pause système), un écrivain en attente voit
  `age > ttl`, fait `rmSync` du verrou du détenteur ACTIF et entre. Puis le `finally`
  du premier (`:153`) supprime le verrou du voleur → un TROISIÈME écrivain peut entrer.
- **(b) Course à deux voleurs sur un orphelin légitime** (process mort → verrou stale,
  deux writers en attente) : B lit `lockAgeMs` (> ttl), **pendant ce temps** A fait
  `rmSync` + `mkdirSync` (acquiert), puis B exécute son `rmSync` — qui supprime le
  verrou TOUT FRAIS de A (`force: true` ne bronche pas) — et `mkdirSync` réussit.
  A et B sont tous deux dans la section critique.

**Repro exécutée** (mécanisme (a), TTL abaissé par env pour compresser la fenêtre —
c'est exactement l'override prévu par le code) :

```
# child: withLock(dir, () => { log ENTER; sleep 1500ms; log EXIT })
ROADMAPED_LOCK_TTL_MS=300  node child.mjs $DIR A 1500 &
sleep 0.6
ROADMAPED_LOCK_TTL_MS=300  node child.mjs $DIR B 1500

--- race.log (obtenu) ---
1784411237271 A ENTER
1784411237908 B ENTER     ← B entre 872 ms AVANT la sortie de A
1784411238780 A EXIT
1784411239414 B EXIT
```

**Conséquence** : deux `addTask` concurrents lisent le même `nextId` dans
`_meta.yaml` (`:329`) → deux tickets avec le même id (le second `commitWrites`
peut le détecter et rollback → erreur « id dupliqué » aléatoire côté user ; s'il
valide entre les deux écritures de l'autre, les DEUX passent). Perte/corruption
de données, intermittente par nature.

**Fix (1 ligne d'esprit)** : au release, ne `rmSync` `.lock` que si `owner`
contient son propre pid ; et voler un orphelin par `renameSync(lockDir, lockDir+'.stale-'+pid)`
(atomique, un seul voleur gagne) au lieu de `rmSync` + `mkdir`.

### 2. « Start » depuis le dashboard ne pose JAMAIS `startedAt`

**Fichiers** : `src/lib/taskWrites.ts:553-556` (le bloc de parité status→dates ne
gère que `completedAt`), `src/components/TaskPanel.tsx` (`start()` fait
`PATCH {status:'in_progress'}`), `src/server/api.ts` (aucune action `start` — vérifié :
zéro occurrence de `startedAt` dans `src/components/`, `src/state/`, `src/server/api.ts`).

**Mécanisme** : seuls le CLI et le MCP passent par `startTask()` (qui pose
`startedAt`, `:403`). Le dashboard passe par `updateTask()` → `updateTaskImpl` ne
touche jamais `startedAt` sur une transition vers `in_progress`.

**Repro** : bouton Start (ou le select de statut) dans le panneau d'un ticket todo
→ le YAML passe `status: in_progress` sans champ `startedAt`. Le sitrep
(`render.ts:215`) et `stalePassepartout` (`:186`) retombent sur `createdAt` → âge
« in progress (43d) » pour un ticket démarré hier. Données d'audit fausses,
incohérence CLI vs dashboard — exactement le genre d'anomalie « aléatoire »
(dépend de QUI a démarré le ticket).

**Fix** : dans le bloc `:553-556`, ajouter
`if (patch.status === 'in_progress' && !raw.startedAt) raw.startedAt = now()` (et
`completedAt = null`, déjà fait).

---

## Bugs confirmés — sévérité MOYENNE (affichage faux / dashboard cassé transitoirement)

### 3. Lectures non verrouillées pendant un commit multi-fichiers → écran d'erreurs de validation fantôme

**Fichiers** : `src/lib/taskWrites.ts:250-261` (écritures séquentielles),
`:373-376` (addTask : fichier tâche écrit AVANT `_meta.yaml`),
`:608-611` (moveTask : fichier neuf écrit AVANT suppression de l'ancien),
`src/server/api.ts:159` (`getTree` sans verrou), `src/components/Backlog.tsx:68-84`
(la MOINDRE erreur de validation masque TOUT le backlog).

**Mécanisme** : le commentaire `:88-90` justifie les lectures sans verrou par
« writeFileSync atomique par fichier » — mais l'invariant validé est
MULTI-fichiers. Un `GET /api/tree` (autre onglet, resync SSE, MCP `list`, CLI
`sitrep`) tombant dans la fenêtre entre deux écritures voit :
- addTask : nouvelle tâche id=N + `_meta.nextId`=N → erreur
  `« nextId (N) <= id max global (N) »` (`validate.ts:277-280`) ;
- moveTask : l'ancien ET le nouveau fichier → `« id N dupliqué »` (`validate.ts:269-271`).

**Repro** : marteler `GET /api/tree` en boucle pendant des `POST /api/tasks` /
des moves — statistiquement l'écran rouge « validation errors in docs/tasks/ »
apparaît puis disparaît au refresh suivant. C'est le prototype du bug user
« mon dashboard s'est cassé tout seul puis c'est reparti ».

**Fix** : dans `treeWithErrors`, si `errors.length > 0`, relire une fois après
~50 ms avant de les retourner (ou faire prendre le verrou aux lectures de l'API).

### 4. `compareReleasesDesc` : suffixes pre-release faux et égalités instables

**Fichier** : `src/lib/release.ts:20` — `parseInt(n, 10) || 0` par segment.

**Mécanisme** (démontré en node) :
- `'0.2.3-rc.1'` → segments `[0,2,3,1]` (le `-rc` est avalé par parseInt, le `.1`
  devient un 4ᵉ segment) → classé **au-dessus** de `0.2.3` — l'inverse de semver.
- `'1.0.0-beta'` → `[1,0,0]` → **égalité** avec `'1.0.0'` : deux groupes
  d'accordéon distincts dont l'ordre relatif = ordre d'insertion dans la Map de
  `groupByRelease` (`release.ts:44-53`) = ordre de recency des done → **l'ordre
  des accordéons change au fil des tickets bouclés**. Idem `'v1.0.0'` vs `'1.0.0'`.
- Les tests (`release.test.ts`) ne couvrent aucun suffixe pre-release.

**Repro** : `['1.0.0','1.0.0-beta'].sort(compareReleasesDesc)` → `['1.0.0','1.0.0-beta']`
mais `['1.0.0-beta','1.0.0'].sort(...)` → `['1.0.0-beta','1.0.0']` (les deux ordres
sont conservés tels quels). Avec l'auto-stamp #341 depuis `package.json.version`,
une version pre-release (`0.3.0-beta.1`) est un cas réel, pas exotique.

**Fix** : séparer le suffixe pre-release (`/[-+]/`) et trancher — release pleine >
pre-release, puis comparaison lexicale du suffixe ; à défaut, tie-break final
`b.localeCompare(a)` pour au moins stabiliser l'ordre.

### 5. `now()` : deux `new Date()` → horodatage faux de ±24 h à minuit

**Fichier** : `src/lib/taskWrites.ts:234-238` — `now()` capture `d = new Date()`
pour l'heure, puis appelle `today()` (`:228-231`) qui crée un **second** `Date`
pour la date.

**Mécanisme** : si le process franchit minuit entre les deux constructions
(`d` à 23:59:59.999, `today()` à 00:00:00.001), le résultat est
`2026-07-19T23:59:59` — un timestamp **24 h dans le futur**. Il passe la
validation (`DATE_OR_DATETIME`), s'écrit dans `createdAt`/`updatedAt`/`completedAt`/
`feedback.date`, et `relativeTime` affiche « in 1 day » ; `sortDone` épingle le
ticket en tête de « Terminées » pendant 24 h. Intermittence maximale : fenêtre de
quelques ms, une fois par jour, sur la machine des agents qui tournent la nuit.
À noter : `TaskPanel.tsx:70-73` (`localNow()`) fait la même chose **correctement**
avec un seul `Date`.

**Fix** : construire date et heure depuis le MÊME objet `Date` dans `now()`
(copier `localNow()` de TaskPanel).

### 6. Body JSON malformé sur PATCH → 200 OK + écriture fantôme de `updatedAt`

**Fichiers** : `src/server/api.ts:227-241` (`readJsonBody` resout `null` sur JSON
invalide, indistinguable d'un body vide), `:173` (`action.body ?? {}`),
`src/lib/taskWrites.ts:395` (`patchActive` bump `updatedAt` même si le mutateur
n'a rien fait).

**Mécanisme** : `PATCH /api/tasks/5` avec body `{"title": "x"` (JSON cassé) →
`body = null` → `updateTask(dir, 5, {})` → aucun champ patché MAIS
`raw.updatedAt = now()` → commit disque + SSE + badge « NEW » fantôme sur un
ticket que personne n'a touché. Réponse : **200 ok**. Attendu : 400.

**Fix** : dans `readJsonBody`, résoudre un sentinel (ex. `Symbol`/`{__invalid:true}`)
sur échec de parse et router vers `badRequest` quand méthode ∈ {POST, PATCH, PUT}
avec body illisible non vide.

---

## Suspects — à vérifier (mécanisme plausible, pas de démonstration complète)

- **Worktrees + `nextId`** : le verrou est par `tasksDir` ; deux agents dans deux
  worktrees ont chacun LEUR copie de `_meta.yaml` → même id alloué des deux côtés,
  collision révélée au merge (l'historique montre des merges `worktree-agent-*` :
  le flux existe). Limitation assumée (`taskWrites.ts:90`) mais c'est une source
  réelle de « id dupliqué » aléatoire post-merge — vérifier les merges passés.
- **PATCH mixte `type` + autres champs** : `api.ts:174-176` — si le body porte
  `type` (ou `section`), TOUT le reste du patch est silencieusement ignoré
  (`moveTask` seul est appelé). L'UI actuelle n'envoie jamais les deux ensemble
  (vérifié TaskPanel) ; latent pour tout client API/MCP tiers.
- **YAML édité à la main avec dates non quotées** : js-yaml (DEFAULT_SCHEMA) parse
  `completedAt: 2026-07-01` en objet `Date` **UTC** (vérifié en node). La
  validation le rejette (« format invalide ») → dashboard ENTIER bloqué sur
  l'écran d'erreurs. L'app quote toujours ses dates au dump (vérifié) — exposition
  limitée aux éditions manuelles/outils tiers, mais l'impact (tout masqué) est brutal.
- **Ids exotiques acceptés** : `Number(seg[1])` (`api.ts:82-83`) accepte `1e1`
  (→ tâche 10), `0x10` (→ 16). Cosmétique, mais surprenant.
- **Recherche par id en sous-chaîne** : `` `#${t.id}`.includes(q) ``
  (`Backlog.tsx:118`) — chercher « 1 » matche #1, #10, #21, #100… Peut-être voulu.
- **Tri des done mixant date seule (héritage) et datetime** : `TaskColumns.tsx:205`
  — `"2026-07-01"` < `"2026-07-01T09:00:00"` en localeCompare → les vieux done
  date-seule sont classés « plus vieux » que tout done datetime du même jour.
  Approximation acceptable, à connaître.

---

## Zones auditées jugées SOLIDES

- **`relativeTime`/`absoluteDate`** (`src/lib/relativeTime.ts`) : date seule
  comparée en jours calendaires LOCAUX (jamais sous le jour), datetime local via
  `Date.parse` sans offset — le précédent #340 est bien colmaté ici.
- **`roadmap.ts` dates** : `localDayMs`/`ageInDays` en local (fix #232),
  `todayLocal()` correct (un seul `Date`... construit deux fois mais champ par
  champ sur le même `d` — pas le bug n°5).
- **`computeAvailability`/`missingPrereqs`/`graphNeighborhood`** : dep vers id
  inconnu → jamais done (locked), cycles → pas de boucle infinie (ensembles
  `seen`), memoization par identité de tree correcte (WeakMap, tree immuable).
- **`validate.ts`** : cycles (DFS 3 couleurs), auto-dépendance, dep inexistante,
  formats de dates, `nextId <= maxId`, unicité globale des ids — couverts et testés.
- **Sérialisation YAML par l'app** : `yaml.dump` quote les strings date-like et
  les caractères spéciaux (deux-points, guillemets, emoji, multi-lignes en bloc
  littéral) — vérifié en node. Champs additifs (kind/heat/startedAt/updatedAt/
  feedback/epic←milestone) : logique `dumpTask` rétrocompat cohérente, y compris
  le cas `{epic: null}` vs milestone hérité.
- **Fix recherche #348** : `forceOpen` couvre les DEUX niveaux d'accordéons
  (EpicRow ET ReleaseSection), gardes `openItems`/`doneItems` cohérentes des deux
  côtés — pas de cas voisin cassé trouvé.
- **Routing API** : traversal (`%2e%2e`) géré en parsant le pathname à la main,
  `unsafeSegment` sur section/dir, id non numérique → 404 propre, tâche
  inexistante → 404, `saveEpics` refuse les bodies malformés avant toute écriture.

---

*Audit du 2026-07-18. Repro du bug 1 : scratchpad (script `lock-race-child.mjs`,
2 process, TTL surchargé par `ROADMAPED_LOCK_TTL_MS` — le mécanisme d'override
prévu pour les tests). Aucun fichier du repo modifié hors ce rapport.*
