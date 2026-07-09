import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile, execFileSync } from 'node:child_process'

/*
 * MAJ auto de l'app (#207) — notify-only, distribution GitHub-only (jamais npm).
 * L'install suit HEAD de `main` (github:5e1y/roadmapped) ; « MAJ dispo » = le
 * commit installé diffère (= en retard) du dernier commit de main. checkUpdate()
 * expose l'état (réutilisé par l'API pour une notif IN-APP, #211) ; notifyIfOutdated()
 * en dérive la ligne terminal du lancement. Toute erreur = silence : jamais bloquant.
 */

const REPO = '5e1y/roadmapped'
const REMOTE = `https://github.com/${REPO}.git`
const CACHE = join(tmpdir(), 'roadmapped-update-check.json')
const DAY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 2000

/** Repo GitHub de distribution — l'UI in-app en a besoin pour les liens/commandes. */
export const UPDATE_REPO = REPO

export interface UpdateStatus {
  /** SHA court du commit installé. */
  installed: string
  /** SHA court du dernier commit de main. */
  remote: string
}

/** Extrait le SHA d'un champ `resolved` de package-lock (`git+…github.com/…#<sha>`). */
export function shaFromResolved(resolved: unknown): string | null {
  if (typeof resolved !== 'string') return null
  const hash = resolved.lastIndexOf('#')
  if (hash === -1) return null
  const sha = resolved.slice(hash + 1)
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null
}

/** SHA du commit roadmapped installé, lu depuis le package-lock de l'hôte
 *  (le package.json installé ne porte AUCUN champ SHA avec npm moderne). */
function installedSha(hostRoot: string): string | null {
  for (const lock of [join(hostRoot, 'package-lock.json'), join(hostRoot, 'node_modules', '.package-lock.json')]) {
    try {
      const json = JSON.parse(readFileSync(lock, 'utf8')) as { packages?: Record<string, { resolved?: string }> }
      const entry = json.packages?.['node_modules/roadmapped']
      const sha = shaFromResolved(entry?.resolved)
      if (sha) return sha
    } catch { /* lock absent/illisible → on tente le suivant */ }
  }
  return null
}

/** Dernier SHA de main sur GitHub : cache (< 24 h) sinon `git ls-remote` (async,
 *  non bloquant). Null si indispo. */
function remoteHeadSha(): Promise<string | null> {
  try {
    const cached = JSON.parse(readFileSync(CACHE, 'utf8')) as { checkedAt: number; remoteSha: string }
    if (Date.now() - cached.checkedAt < DAY_MS && typeof cached.remoteSha === 'string') return Promise.resolve(cached.remoteSha)
  } catch { /* pas de cache → on interroge */ }

  // git ls-remote : pas de limite de taux, pas d'auth, git est présent (l'install
  // github: en dépend). execFile (async) pour ne PAS bloquer le boot du serveur.
  return new Promise((resolve) => {
    execFile('git', ['ls-remote', REMOTE, 'HEAD'], { timeout: TIMEOUT_MS }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      const sha = stdout.split(/\s/)[0]
      if (!/^[0-9a-f]{40}$/i.test(sha)) return resolve(null)
      try { writeFileSync(CACHE, JSON.stringify({ checkedAt: Date.now(), remoteSha: sha })) } catch { /* FS RO */ }
      resolve(sha)
    })
  })
}

/** État de MAJ : `null` si à jour / indéterminable / clone de dev, sinon les deux
 *  SHA courts. Silencieux sur toute erreur. Sauté dans un clone de dev
 *  (packageDir/.git présent : l'auteur travaille sur les sources). */
export async function checkUpdate(packageDir: string, hostRoot: string): Promise<UpdateStatus | null> {
  try {
    // ponytail: hook de test/design — ROADMAPPED_FAKE_UPDATE=1 force un état « MAJ
    // dispo » pour rendre la notif in-app sans clone en retard (le self-host renvoie
    // toujours null, .git présent). De VRAIS SHA POUSSÉS (origin/main~5 → origin/main,
    // pas HEAD qui peut être en avance) → le lien GitHub compare de la notif marche en test.
    // Fallback sur des SHA fictifs si git indisponible. Inerte en prod (personne ne le pose).
    if (process.env.ROADMAPPED_FAKE_UPDATE) {
      try {
        const short = (rev: string) => execFileSync('git', ['-C', packageDir, 'rev-parse', '--short', rev], { encoding: 'utf8' }).trim()
        const installed = short('origin/main~5')
        const remote = short('origin/main')
        if (/^[0-9a-f]{7,}$/i.test(installed) && /^[0-9a-f]{7,}$/i.test(remote) && installed !== remote) {
          return { installed, remote }
        }
      } catch { /* pas de git / pas assez de commits → fallback fictif */ }
      return { installed: 'a1b2c3d', remote: 'e4f5a6b' }
    }
    if (existsSync(join(packageDir, '.git'))) return null
    const installed = installedSha(hostRoot)
    if (!installed) return null
    const remote = await remoteHeadSha()
    if (!remote || remote.startsWith(installed) || installed.startsWith(remote)) return null
    return { installed: installed.slice(0, 7), remote: remote.slice(0, 7) }
  } catch {
    return null
  }
}

/** Ligne terminale au lancement du dashboard (#207) — dérivée de checkUpdate. */
export async function notifyIfOutdated(packageDir: string, hostRoot: string): Promise<void> {
  const u = await checkUpdate(packageDir, hostRoot)
  if (!u) return
  console.log(
    `\nroadmapped: a newer version is available on GitHub (${u.installed} → ${u.remote})\n` +
    `  npm install github:${REPO} && npx roadmapped upgrade\n`,
  )
}
