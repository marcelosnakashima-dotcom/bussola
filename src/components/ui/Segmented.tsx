// Seletor segmentado (período, visão etc.). Acessível como grupo de rádio.
export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
      {options.map(o => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors ${
              active ? 'bg-surface text-ink' : 'text-muted hover:text-ink'}`}
            style={active ? { boxShadow: 'var(--shadow-sm)' } : undefined}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
