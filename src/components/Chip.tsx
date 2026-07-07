export function Chip({ label, mono = false }: { label: string; mono?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded border border-neutral-200 bg-neutral-50 px-1.5 py-px text-[11px] leading-4 text-neutral-500 ${
        mono ? 'font-mono' : ''
      }`}
    >
      {label}
    </span>
  )
}
