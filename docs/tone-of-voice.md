# Tone of voice — la voix de Rémi (et de Roadmapped)

**Statut : DRAFT — proposition Fable à relire par Rémi.**
S'applique à TOUTE communication publique : posts, site, README, fiches produit,
réponses aux commentaires. **Pas à l'UI de l'app** (elle reste neutre et sobre — la
voix vit dans ce qu'on dit, pas dans les libellés d'interface).

## La voix en une phrase

Direct, pince-sans-rire, sarcastique **mais jamais négatif** : une transparence
désarmante qui dit ce que les autres cachent, et qui se dédouane du marketing —
tout en sachant très bien que c'est du marketing, et en le disant aussi.

## Les cinq principes

1. **Dire le vrai, surtout quand c'est inconfortable.** Chiffres réels, raccourcis
   assumés, échecs racontés. La transparence n'est pas une posture : on montre le
   commit, le fichier, le nombre. Si c'est embarrassant, c'est probablement le
   meilleur passage du post.
2. **La chute est sèche et arrive à la fin.** Pas de « 😂 », pas de « (oui oui,
   vraiment !) ». On affirme calmement quelque chose d'absurde ou d'inconfortablement
   vrai, et on passe à la suite comme si de rien n'était.
3. **Le sarcasme vise vers le haut ou vers soi.** Cibles autorisées : les conventions
   du SaaS, le marketing (le sien inclus), l'industrie, soi-même. Cibles interdites :
   les utilisateurs, les débutants, les concurrents nommés. Jamais d'amertume — on se
   moque de ce qu'on aime.
4. **L'anti-marketing assumé, avec méta-honnêteté.** Se dédouaner du marketing EST le
   marketing, et on ne prétend pas le contraire : « Je ne vais pas vous vendre quoi
   que ce soit. Enfin si, évidemment, c'est un post LinkedIn. Mais mollement. »
5. **Les faits font les compliments.** Aucun superlatif auto-décerné. Interdits à
   vie : révolutionnaire, game-changer, incroyable, l'avenir de, 🚀. Un fait précis
   et vérifiable impressionne plus qu'un adjectif.

## Mécanique d'écriture

- Phrases courtes. Une idée par phrase. La parenthèse est l'arme de la chute.
- Précision maniaque des chiffres (« 113 tests », pas « une solide suite de tests »)
  — la précision EST le gag quand elle est excessive.
- L'aveu préventif : désamorcer l'objection en la formulant mieux que le critique ne
  l'aurait fait. « Oui, c'est un dossier de fichiers YAML. Non, ce n'est pas une
  base de données. C'est un peu le sujet. »
- Le disclaimer devient une blague : « Aucune newsletter ne vous attend au tournant. »
- Tutoiement/vouvoiement : FR = vouvoiement légèrement décalé ; EN = « you », direct.

## Exemples par canal (à valider — c'est là que la voix se juge)

### LinkedIn (FR, récit founder)

> J'ai passé trois semaines à construire un outil de gestion de projet pour éviter
> de gérer mon projet.
>
> Ça s'appelle Roadmapped. C'est open source, c'est des fichiers YAML dans votre
> repo, et c'est piloté par un agent IA qui consigne son travail plus proprement
> que moi. L'outil s'est construit lui-même en s'utilisant — le backlog du repo en
> témoigne, commit par commit, avec une honnêteté que je trouve personnellement
> excessive.
>
> Je ne vais pas vous dire que ça va révolutionner votre productivité. C'est un
> dossier. Mais c'est un très bon dossier.
>
> Lien en commentaire, comme le veut la tradition que je désapprouve et respecte.

### Show HN (EN, premier commentaire)

> Yes, it's YAML files in your repo. No, there's no database — the files are the
> database, your git history is the audit log, and `rm -rf` is the account deletion
> flow (GDPR compliant by design).
>
> I built it by using it: the tool's own backlog is managed by the tool, mostly by
> a Claude agent that records what it ships with more discipline than I've ever
> had. The done backlog is the changelog. I'm told this is called dogfooding;
> it felt more like being managed by my own side project.

### Site (microcopy)

- Hero : « Votre repo est déjà votre outil de gestion de projet. On a juste ajouté
  l'interface. »
- Sous le CTA : « npm install. Il n'y a pas d'étape 2, on a vérifié. »
- Section privacy : « Vos données restent chez vous. Pas par conviction militante —
  on n'a simplement pas de serveur. »
- Footer : « Fait avec un agent IA qui relit ce site et le trouve trop vendeur. »

### README (EN, ouverture)

> Project management as flat files. No account, no sync, no onboarding call with
> our customer success team (we don't have one — we don't have customers, it's
> free).

### Réponse à une critique technique (HN/Reddit)

> Fair point. It's now task #52 in the public backlog — you can watch me not get
> to it in real time. (Actually filed, though: [lien]. Thanks.)

## Ce que la voix n'est PAS

- Pas cynique : on aime ce qu'on construit, ça doit transpirer sous la sécheresse.
- Pas négatif : jamais de plainte, jamais de « X est nul » — on constate, on sourit.
- Pas forcé : si la blague ne vient pas, une phrase factuelle sèche fait le travail.
  Le ton est un assaisonnement, pas le plat.
- Pas dans l'UI : les boutons disent « Terminer », pas « Bon, on y va ? ».

---
*Tâches concernées : #16 (copy du site), #19 (plan de comms — docs/comms-plan.md à
relire sous cet angle), #20 (contenus d'annonce : appliquer ce guide à la lettre).*
