import { useState } from 'react'
import { ResponsiveContainer, Treemap } from 'recharts'
import { brl, pct } from '@/lib/format'

export interface TreeItem { id: string; name: string; value: number; color: string; pct: number }

// Mapa de categorias em blocos (área proporcional ao gasto). Passar o mouse destaca o
// bloco e mostra o detalhe embaixo; clicar filtra.
export function CategoryTreemap({ items, selected, onSelect, height = 280 }: {
  items: TreeItem[]
  selected?: string | null
  onSelect?: (id: string | null) => void
  height?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const foco = items.find(i => i.id === (hover ?? selected)) ?? null
  const data = items.filter(i => i.value > 0).map(i => ({ ...i, size: i.value }))

  const Node = (p: any) => {
    const { x, y, width, height: h, id, name, color, value } = p
    if (!id || width <= 0 || h <= 0) return null
    const on = (hover ?? selected) === id
    const dim = !!(hover ?? selected) && !on
    const mostraTexto = width > 70 && h > 38
    return (
      <g onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}
        onClick={() => onSelect?.(selected === id ? null : id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
        <rect x={x + 2} y={y + 2} width={Math.max(width - 4, 0)} height={Math.max(h - 4, 0)} rx={12}
          fill={color} fillOpacity={dim ? 0.35 : on ? 1 : 0.85}
          stroke={on ? 'var(--ink)' : 'transparent'} strokeWidth={2} style={{ transition: 'fill-opacity .2s' }} />
        {mostraTexto && (
          <>
            <text x={x + 12} y={y + 22} fill="#fff" fontSize={12} fontWeight={600}>{String(name).slice(0, Math.floor(width / 7.5))}</text>
            <text x={x + 12} y={y + 38} fill="rgba(255,255,255,0.85)" fontSize={11}>{brl(value)}</text>
          </>
        )}
      </g>
    )
  }

  if (data.length === 0) return <p className="text-sm text-muted py-8 text-center">Sem despesas no período.</p>
  return (
    <div>
      <div style={{ height }} role="img" aria-label="Mapa das despesas por categoria">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={data} dataKey="size" isAnimationActive={false} content={<Node />} />
        </ResponsiveContainer>
      </div>
      <div className="mt-3 min-h-[40px] rounded-xl bg-surface-2 px-3 py-2 text-xs" aria-live="polite">
        {foco ? (
          <p><span className="font-semibold text-ink">{foco.name}</span> · <span className="num font-medium text-ink">{brl(foco.value)}</span> · <span className="text-muted">{pct(foco.pct)} das despesas</span></p>
        ) : <p className="text-muted pt-0.5">Toque ou passe o mouse sobre um bloco para ver o valor.</p>}
      </div>
    </div>
  )
}
