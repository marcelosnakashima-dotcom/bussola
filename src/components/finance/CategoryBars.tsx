import { CLASS_COLOR } from '@/components/charts/kit'
import { brl, pct } from '@/lib/format'
import type { CatTotal } from '@/lib/finance'

// Barras horizontais por categoria; clicar filtra (clicar de novo limpa).
export function CategoryBars({ data, selected, onSelect, limit, color: corFixa, vazio = 'Sem despesas no período.' }: {
  data: CatTotal[]
  selected?: string | null
  onSelect?: (id: string | null) => void
  limit?: number
  color?: string
  vazio?: string
}) {
  const rows = limit ? data.slice(0, limit) : data
  const max = Math.max(...rows.map(r => r.valor), 1)
  if (rows.length === 0) return <p className="text-sm text-muted py-6 text-center">{vazio}</p>
  return (
    <ul className="flex flex-col gap-1">
      {rows.map(r => {
        const active = selected === r.id
        const dim = !!selected && !active
        const color = corFixa ?? (r.classificacao ? CLASS_COLOR[r.classificacao] : 'var(--muted)')
        const Comp = onSelect ? 'button' : 'div'
        return (
          <li key={r.id}>
            <Comp {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(active ? null : r.id), 'aria-pressed': active } : {})}
              className={`w-full text-left rounded-xl px-2.5 py-2 transition-colors ${onSelect ? 'hover:bg-surface-2' : ''} ${active ? 'bg-surface-2' : ''}`}
              style={{ opacity: dim ? 0.5 : 1 }}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink">{r.nome}</span>
                <span className="num shrink-0 font-medium text-ink">{brl(r.valor)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(r.valor / max) * 100}%`, background: color }} />
                </div>
                <span className="num text-[11px] text-muted w-9 text-right">{pct(r.pct)}</span>
              </div>
            </Comp>
          </li>
        )
      })}
    </ul>
  )
}
