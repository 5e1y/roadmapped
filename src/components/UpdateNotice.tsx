import { Popover } from '@base-ui/react/popover'
import { ArrowRight, Check, Copy, Download, ExternalLink } from 'trinil-react'
import { useRef, useState } from 'react'
import { useOptionalTreeState } from '../state/TreeContext'

/*
 * Notif de mise à jour (#211) : la ligne « update available » quitte le
 * terminal pour vivre dans le header, même famille que LiveActivityMenu —
 * Popover Base UI, trigger rounded-md h-aligné dans le cluster droit. Le point
 * accent sur le trigger est le SEUL bleu : une MAJ dispo est un vrai point
 * d'attention (usage légitime de l'accent, design.md §1), le reste du popup
 * est monochrome strict.
 *
 * Données : useTree().update (seam posé par #211 côté serveur). null = à jour /
 * clone de dev / build démo → rien. Hors provider (tests) : rien non plus
 * (useOptionalTreeState, pattern non-jetant).
 *
 * Dismiss de SESSION : flag module-level — il survit aux remontages de
 * ViewHeader (une instance par vue) sans provider dédié, et repart à zéro au
 * prochain lancement. Pas de persistance : c'est voulu.
 */

let dismissedThisSession = false

/** Feedback « copied » : durée du ✓ avant retour à l'icône Copy. */
const COPIED_MS = 1500

function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      /* clipboard indisponible (permissions, http) : la commande reste
         sélectionnable à la main dans le bloc voisin. */
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? 'Copied' : 'Copy upgrade command'}
      className="flex shrink-0 items-center gap-1 self-stretch border border-neutral-300 bg-white px-2 text-[11px] text-neutral-700 transition-colors hover:bg-neutral-100"
    >
      {copied ? <Check size={10} className="shrink-0" /> : <Copy size={10} className="shrink-0" />}
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

function UpdateNoticeInner({ update }: { update: { installed: string; remote: string; repo: string } }) {
  const [dismissed, setDismissed] = useState(dismissedThisSession)
  // #295 : le clic FORCE l'update + restart. idle → updating (le serveur se coupe et
  // revient) → reload auto ; error → on retombe sur la commande manuelle.
  const [phase, setPhase] = useState<'idle' | 'updating' | 'error'>('idle')
  if (dismissed) return null

  const dismiss = () => {
    dismissedThisSession = true
    setDismissed(true)
  }

  const compareUrl = `https://github.com/${update.repo}/compare/${update.installed}...${update.remote}`
  const command = `npm install github:${update.repo} && npx roadmapped upgrade`

  const runUpdate = async () => {
    setPhase('updating')
    try {
      const res = await fetch('/api/update', { method: 'POST' })
      if (!res.ok) return setPhase('error') // 409 = à jour / clone de dev / offline
    } catch {
      return setPhase('error')
    }
    // Le serveur se coupe puis rebinde le même port avec la nouvelle version. On sonde
    // /api/tree (qui échoue pendant le downtime d'install) et on recharge dès son
    // retour. Abandon après ~5 min → l'utilisateur relance à la main.
    const deadline = Date.now() + 5 * 60 * 1000
    const poll = async () => {
      if (Date.now() > deadline) return setPhase('error')
      try {
        const r = await fetch('/api/tree', { cache: 'no-store' })
        if (r.ok) return window.location.reload()
      } catch { /* serveur down pendant le restart → on continue à sonder */ }
      window.setTimeout(() => void poll(), 1500)
    }
    window.setTimeout(() => void poll(), 2000) // laisse le vieux serveur se couper d'abord
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Update available"
        className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 data-[popup-open]:bg-neutral-100 data-[popup-open]:text-neutral-900"
      >
        <Download size={11} className="text-neutral-500" />
        Update
        {/* Le point d'attention : l'unique accent du composant. */}
        <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-80 origin-[var(--transform-origin)] border border-neutral-200 bg-white shadow-lg transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <div className="flex items-baseline justify-between border-b border-neutral-200 px-3 py-2">
              <Popover.Title className="text-xs font-semibold text-neutral-900">Update available</Popover.Title>
              <a
                href={compareUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
              >
                what changed
                <ExternalLink size={9} className="shrink-0" />
              </a>
            </div>
            <div className="flex flex-col gap-2.5 px-3 py-2.5">
              <Popover.Description className="text-xs text-neutral-600">
                A newer Roadmapped is on main.
              </Popover.Description>
              <div className="flex items-center gap-2 font-mono text-[11px]" aria-label={`Installed ${update.installed}, latest ${update.remote}`}>
                <span className="text-neutral-500" title="installed">{update.installed}</span>
                <ArrowRight size={9} className="shrink-0 text-neutral-400" aria-hidden="true" />
                <span className="font-semibold text-neutral-900" title="latest on main">{update.remote}</span>
              </div>
              {phase === 'error' ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] text-neutral-500">Couldn’t start the update. Run it manually:</p>
                  <div className="flex items-stretch gap-1.5">
                    {/* break-all : la commande entière reste visible (pas de scroll
                        horizontal caché dans un popup de 320px). */}
                    <code className="min-w-0 flex-1 break-all border border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-800">
                      {command}
                    </code>
                    <CopyCommandButton command={command} />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void runUpdate()}
                  disabled={phase === 'updating'}
                  className="flex items-center justify-center gap-1.5 border border-neutral-900 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Download size={11} className="shrink-0" />
                  {phase === 'updating' ? 'Updating & restarting…' : 'Update & restart'}
                </button>
              )}
              {phase === 'updating' && (
                <p className="text-[11px] text-neutral-500 motion-safe:animate-pulse">
                  The dashboard restarts with the new version — this page reloads automatically.
                </p>
              )}
            </div>
            <Popover.Close
              render={<button type="button" />}
              onClick={dismiss}
              className="flex w-full border-t border-neutral-100 px-3 py-1.5 text-left text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            >
              Hide for this session
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Déclencheur du header. Rien à signaler (update null) ou hors provider : null. */
export function UpdateNotice() {
  const update = useOptionalTreeState()?.update ?? null
  if (!update) return null
  return <UpdateNoticeInner update={update} />
}
