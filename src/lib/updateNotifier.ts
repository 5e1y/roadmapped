import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

/*
 * MAJ auto de l'app (#207) — pattern update-notifier, notify-only. Distribution
 * GitHub-only (décision Rémi : jamais npm) : `github:5e1y/roadmapped`, l'install
 * suit HEAD de `main`. « MAJ dispo » = le commit installé est différent (= en
 * retard) du dernier commit de main. JAMAIS d'install auto. Toute erreur = silence
 * total : la notif ne doit ni casser ni ralentir un lancement.
 */

const REPO = '5e1y/roadmapped'
const REMOTE = `https://github.com/${REPO}.git`
const CACHE = join(tmpdir(), 'roadmapped-update-check.json')
const DAY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 2000

/** Extrait le SHA d'un champ `resolved` de package-lock (`git+…github.com/…#<sha>`). */
export function shaFromResolved(resolved: unknown): string | null {
  if (typeof resolved !== 'string') return null
  const hash = resolved.lastIndexOf('#')
  if (hash === -1) return null
  const sha = resolved.slice(hash + 1)
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null
}

/** SHA du commit roadmapped installé, lu depuis le package-lock de l'hôte
 *  (le package.json installé ne porte AUCun champ SHA avec npm moderne). */
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

/** Dernier SHA de main sur GitHub : cache (< 24 h) sinon `git ls-remote`. Null si indispo. */
function remoteHeadSha(): string | null {
  try {
    const cached = JSON.parse(readFileSync(CACHE, 'utf8')) as { checkedAt: number; remoteSha: string }
    if (Date.now() - cached.checkedAt < DAY_MS && typeof cached.remoteSha === 'string') return cached.remoteSha
  } catch { /* pas de cache → on interroge */ }

  // git ls-remote : pas de limite de taux, pas d'auth, git est présent (l'install
  // github: en dépend). HEAD = dernier commit de la branche par défaut (main).
  const r = spawnSync('git', ['ls-remote', REMOTE, 'HEAD'], { timeout: TIMEOUT_MS, encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout) return null
  const sha = r.stdout.split(/\s/)[0]
  if (!/^[0-9a-f]{40}$/i.test(sha)) return null
  try { writeFileSync(CACHE, JSON.stringify({ checkedAt: Date.now(), remoteSha: sha })) } catch { /* FS RO : tant pis */ }
  return sha
}

/** Affiche une notice si le commit installé diffère du dernier commit de main.
 *  Silencieux sur toute erreur (offline, pas de lock, git absent, FS). Borné à
 *  ~2 s, 1×/jour via cache. Sauté dans un clone de dev (packageDir/.git présent :
 *  l'auteur travaille sur les sources, pas sur une install). */
export async function notifyIfOutdated(packageDir: string, hostRoot: string): Promise<void> {
  try {
    if (existsSync(join(packageDir, '.git'))) return // clone dev / self-host : pas de notice
    const installed = installedSha(hostRoot)
    if (!installed) return // install non-npm (pnpm/yarn/bun) ou lock absent → no-op
    const remote = remoteHeadSha()
    if (!remote || remote.startsWith(installed) || installed.startsWith(remote)) return // à jour
    console.log(
      `\nroadmapped: a newer version is available on GitHub (${installed.slice(0, 7)} → ${remote.slice(0, 7)})\n` +
      `  npm install github:${REPO} && npx roadmapped upgrade\n`,
    )
  } catch { /* toute défaillance → aucune notif, aucun throw */ }
}
