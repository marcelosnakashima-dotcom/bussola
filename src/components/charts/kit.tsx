// Kit comum dos gráficos novos: cores, eixos e tooltip no padrão da Arsen.
import type { ReactNode } from 'react'
import { brl } from '@/lib/format'

export const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)']
// Categorias e fontes: paleta que NÃO repete as cores dos grupos 50/30/20 (verde, terracota, azul)
export const CAT_SERIES = ['var(--c6)', 'var(--c5)', 'var(--c4)', 'var(--c7)', 'var(--c8)', '#64748B', '#0D9488', '#9333EA']
export const CLASS_COLOR = { necessidade: 'var(--nec)', desejo: 'var(--des)', poupanca: 'var(--pou)' } as const
export const CLASS_LABEL = { necessidade: 'Necessidades', desejo: 'Desejos', poupanca: 'Poupança' } as const

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: 'var(--muted)' },
} as const

export const gridProps = { stroke: 'var(--border)', strokeDasharray: '3 3', vertical: false } as const

type TooltipEntry = { name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }

// Conteúdo de tooltip: título + linhas "cor • nome  valor".
export function ChartTooltip({ active, payload, label, title, format = brl }: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: ReactNode
  title?: (label: ReactNode, payload: TooltipEntry[]) => ReactNode
  format?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs min-w-[150px]"
      style={{ boxShadow: 'var(--shadow-md)' }}>
      <p className="font-semibold text-ink mb-1">{title ? title(label, payload) : label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num font-medium text-ink">{format(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}

// Legenda clicável: mostra/oculta séries.
export function LegendToggle({ items, hidden, onToggle }: {
  items: { key: string; label: string; color: string }[]
  hidden: Set<string>
  onToggle: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(it => {
        const off = hidden.has(it.key)
        return (
          <button key={it.key} type="button" onClick={() => onToggle(it.key)} aria-pressed={!off}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] transition-opacity"
            style={{ opacity: off ? 0.45 : 1 }}>
            <span className="w-2 h-2 rounded-full" style={{ background: it.color }} />
            <span className="text-ink">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
