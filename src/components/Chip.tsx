/**
 * Familles de chips, différenciées en restant monochromes :
 *  - défaut  : métadonnée neutre (statut de section, epic) — bord + fond clairs ;
 *  - strong  : donnée saillante — fond et encre plus marqués ;
 *  - mono    : valeur technique — police mono.
 * Les tags ne sont PAS des chips (texte léger `#tag` dans TaskRow) : trois
 * familles visuelles suffisent, tout-en-chips rendait la ligne illisible.
 */
export function Chip({ label, mono = false, strong = false }: { label: string; mono?: boolean; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-px text-[11px] leading-4 ${
        strong
          ? 'border-neutral-300 bg-neutral-100 font-medium text-neutral-600'
          : 'border-neutral-200 bg-neutral-50 text-neutral-500'
      } ${mono ? 'font-mono' : ''}`}
    >
      {label}
    </span>
  )
}
