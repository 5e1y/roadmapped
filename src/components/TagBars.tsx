/**
 * Diagramme en BÂTONS VERTICAUX des tickets ouverts par tag (#395, décision Rémi —
 * remplace l'ex-graphe nodal). Pur HTML/flex (pas de SVG) : chaque tag = une colonne,
 * hauteur ∝ fréquence, la valeur au-dessus, le `#tag` dessous. Accent = la donnée
 * (même registre que les jauges / la série « Closed » du chart).
 */
export function TagBars({ data }: { data: { tag: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="px-4 py-4">
      <div className="flex items-stretch gap-2" style={{ height: 240 }}>
        {data.map(({ tag, count }) => (
          <div key={tag} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {/* Zone de barre : valeur au-dessus, barre collée en bas (justify-end).
                Cap 88 % pour que la valeur de la plus haute barre tienne au-dessus. */}
            <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-end">
              <span className="mb-0.5 font-mono text-[11px] tabular-nums text-textsoft">{count}</span>
              <div
                className="w-full max-w-[26px] rounded-t-interactive bg-accent"
                style={{ height: `${Math.max(2, (count / max) * 88)}%` }}
              />
            </div>
            <span className="w-full truncate text-center text-[11px] text-textsoft" title={`#${tag}`}>
              #{tag}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
