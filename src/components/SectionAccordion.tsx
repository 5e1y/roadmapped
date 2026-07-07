import { Accordion } from '@base-ui/react/accordion'
import { TaskRow } from './TaskRow'
import { Chip } from './Chip'
import { Chevron } from './glyphs'
import { usePanel } from '../state/PanelContext'
import { countTasksDeep, SECTION_STATUS_FR } from '../lib/tasks'
import type { SectionNode } from '../lib/tasks'

/**
 * Une section = un Accordion.Item (le Root, `multiple`, vit dans Backlog).
 * `dimmed` = rendu archive : bordure pointillée, titre atténué, pas d'actions.
 */
export function SectionAccordion({
  section,
  dimmed = false,
}: {
  section: SectionNode
  dimmed?: boolean
}) {
  const { openSection, openCreateTask } = usePanel()
  // Comptage récursif (sous-tâches comprises) = même définition que l'en-tête
  // global du Backlog, pour que la somme des sections égale le total affiché.
  const { done, total } = countTasksDeep(section.tasks)
  return (
    <Accordion.Item
      value={section.key}
      className={`overflow-hidden rounded-lg border bg-white ${
        dimmed ? 'border-dashed border-neutral-300' : 'border-neutral-200'
      }`}
    >
      <Accordion.Header>
        {/* Le padding vit dans le Trigger : tout l'en-tête (hauteur comprise)
            déplie la section, pas seulement le texte. */}
        <div className="flex w-full items-center gap-2.5 hover:bg-neutral-50">
          <Accordion.Trigger className={`flex flex-1 items-center gap-2.5 py-3 pl-4 text-left ${dimmed ? 'pr-4' : ''}`}>
            <Chevron />
            <span className={`flex-1 text-sm font-semibold ${dimmed ? 'text-neutral-500' : 'text-neutral-900'}`}>
              {section.title}
            </span>
            {section.status !== 'open' && <Chip label={SECTION_STATUS_FR[section.status]} />}
            <span className="shrink-0 font-mono text-xs text-neutral-400">{done}/{total}</span>
          </Accordion.Trigger>
          {!dimmed && (
            <div className="flex shrink-0 items-center gap-1 self-stretch pr-3">
              <button type="button" aria-label="Éditer la section"
                onClick={(e) => { e.stopPropagation(); openSection(section.key) }}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M9 2.5l2.5 2.5L5 11.5 2.5 12l.5-2.5L9 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); openCreateTask(section.key) }}
                className="rounded px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800">
                + tâche
              </button>
            </div>
          )}
        </div>
      </Accordion.Header>
      <Accordion.Panel className="border-t border-neutral-200">
        {section.note && (
          <p className="border-b border-neutral-100 px-4 py-2.5 text-xs leading-relaxed text-neutral-500">
            {section.note}
          </p>
        )}
        {section.tasks.length === 0 ? (
          dimmed ? (
            <p className="px-4 py-2.5 text-xs text-neutral-400">Aucune tâche.</p>
          ) : (
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-xs text-neutral-400">Aucune tâche.</span>
              <button type="button" onClick={() => openCreateTask(section.key)}
                className="rounded px-2 py-1 text-[11px] text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800">
                + première tâche
              </button>
            </div>
          )
        ) : (
          <div className="divide-y divide-neutral-100">
            {section.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  )
}
