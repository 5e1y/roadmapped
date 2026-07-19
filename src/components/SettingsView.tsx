import { Desktop, Sun, Moon, Bug, ExternalLink } from 'trinil-react'
import { ViewShell } from './ViewHeader'
import { UpdateNotice } from './UpdateNotice'
import {
  useThemeMode, THEME_MODES, type ThemeMode,
  useThemeName, THEME_NAMES, THEME_LABELS, type ThemeName,
} from '../state/theme'

/**
 * Page Settings (#395, décision Rémi) — le foyer des réglages transverses qui
 * encombraient le header : le THÈME (clair/sombre + thème intégré) et le
 * SIGNALEMENT DE BUG, plus la notif de MAJ. Le header ne garde ainsi que titre +
 * recherche + « + task ». Atteinte par l'onglet « Settings » en bas du rail.
 */

const MODE_META: Record<ThemeMode, { label: string; Icon: typeof Sun }> = {
  system: { label: 'System', Icon: Desktop },
  light: { label: 'Light', Icon: Sun },
  dark: { label: 'Dark', Icon: Moon },
}

/** Aperçu de l'accent CLAIR de chaque thème (le seul hex hors index.css, cf. ThemePicker). */
const SWATCH: Record<ThemeName, string> = {
  roadmapped: '#2563eb', github: '#0969da', cursor: '#0b6bcb', claude: '#c15f3c', codex: '#0a7a5c',
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-texthard">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-textsoft">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function SettingsView() {
  const [mode, setMode] = useThemeMode()
  const [name, setName] = useThemeName()

  return (
    <ViewShell>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
          <Section title="Appearance" hint="Light or dark, and which built-in theme (colour + shape) the whole app wears.">
            {/* Clair / sombre / système — segmented. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-textsoft">Mode</span>
              <div role="group" aria-label="Theme mode" className="inline-flex w-fit gap-1">
                {THEME_MODES.map((m) => {
                  const { label, Icon } = MODE_META[m]
                  const active = m === mode
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 rounded-interactive px-2.5 py-1 text-xs ring-1 ring-inset transition-colors ${
                        active ? 'bg-active font-medium text-texthard ring-accent' : 'bg-foreground text-textsoft ring-border hover:bg-rollover'
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Thèmes intégrés — cartes à pastille d'accent. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-textsoft">Theme</span>
              <div role="group" aria-label="Theme" className="flex flex-wrap gap-2">
                {THEME_NAMES.map((t) => {
                  const active = t === name
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setName(t)}
                      aria-pressed={active}
                      className={`flex items-center gap-2 rounded-interactive px-2.5 py-1.5 text-xs ring-1 ring-inset transition-colors ${
                        active ? 'bg-active font-medium text-texthard ring-accent' : 'bg-foreground text-textsoft ring-border hover:bg-rollover'
                      }`}
                    >
                      <span className="size-3 shrink-0 rounded-round" style={{ backgroundColor: SWATCH[t] }} aria-hidden="true" />
                      {THEME_LABELS[t]}
                    </button>
                  )
                })}
              </div>
            </div>
          </Section>

          <Section title="Feedback" hint="Something broken or missing? Open a bug on GitHub.">
            <a
              href="https://github.com/5e1y/roadmapped/issues/new?template=bug_report.yml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-interactive px-2.5 py-1.5 text-xs text-texthard ring-1 ring-inset ring-border transition-colors hover:bg-rollover"
            >
              <Bug size={13} className="text-textsoft" />
              Report an issue
              <ExternalLink size={11} className="text-textsoft" />
            </a>
          </Section>

          <Section title="Updates" hint="Roadmapped auto-updates from GitHub main; the banner shows up here when a newer build is on main.">
            <UpdateNotice />
          </Section>
        </div>
      </div>
    </ViewShell>
  )
}
