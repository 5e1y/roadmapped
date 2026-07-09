import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/*
 * MAJ auto de l'app (#207) — pattern update-notifier, notify-only. Au lancement du
 * dashboard, on compare la version installée à la dernière publiée sur npm et on
 * affiche une ligne si une MAJ existe. JAMAIS d'install auto (muter les deps de
 * l'utilisateur en silence est dangereux). Toute erreur = silence total : la notif
 * ne doit ni casser ni ralentir un lancement.
 */

const REGISTRY = 'https://registry.npmjs.org/roadmapped/latest'
const CACHE = join(tmpdir(), 'roadmapped-update-check.json')
const DAY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 800

/** Comparateur naïf major.minor.patch. `ponytail: ignore les pré-releases
 *  (-beta…) — notre versionnage est en x.y.z ; upgrade = vrai semver si besoin. */
export function isOutdated(installed: string, latest: string): boolean {
  const parse = (v: string) => v.split('-')[0].split('.').map((n) => Number(n) || 0)
  const [a0 = 0, a1 = 0, a2 = 0] = parse(installed)
  const [b0 = 0, b1 = 0, b2 = 0] = parse(latest)
  if (b0 !== a0) return b0 > a0
  if (b1 !== a1) return b1 > a1
  return b2 > a2
}

/** Dernière version : cache (< 24 h) sinon fetch registre. Renvoie null si indispo. */
async function latestVersion(): Promise<string | null> {
  try {
    const cached = JSON.parse(readFileSync(CACHE, 'utf8')) as { checkedAt: number; latest: string }
    if (Date.now() - cached.checkedAt < DAY_MS && typeof cached.latest === 'string') return cached.latest
  } catch { /* pas de cache (ou illisible) → on fetch */ }

  const res = await fetch(REGISTRY, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) return null // 404 : paquet pas encore publié → no-op silencieux
  const body = (await res.json()) as { version?: unknown }
  const latest = typeof body.version === 'string' ? body.version : null
  if (latest) {
    try { writeFileSync(CACHE, JSON.stringify({ checkedAt: Date.now(), latest })) } catch { /* FS RO : tant pis */ }
  }
  return latest
}

/** Affiche une notice si une version plus récente est publiée. Silencieux sur toute
 *  erreur (offline, non publié, JSON invalide, FS). Borné à ~800 ms, 1×/jour via cache. */
export async function notifyIfOutdated(packageDir: string): Promise<void> {
  try {
    const { version: installed } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version?: string }
    if (typeof installed !== 'string') return
    const latest = await latestVersion()
    if (!latest || !isOutdated(installed, latest)) return
    console.log(
      `\nroadmapped: update available ${installed} → ${latest}\n` +
      `  npm install roadmapped@latest && npx roadmapped upgrade\n`,
    )
  } catch { /* toute défaillance → aucune notif, aucun throw */ }
}
