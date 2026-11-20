import { useState } from 'react'
import { brl, pct } from '@/lib/format'
import { useCountUp } from '@/hooks/useCountUp'

export interface DonutItem { id: string; label: string; value: number; color: string; hint?: string }

// Arco anular em SVG (ângulos em radianos, 0 = topo, sentido horário)
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0)
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`
}

// Rosca interativa: passar o mouse na fatia ou na legenda destaca as duas e mostra o
// valor no centro; clicar chama onSelect. A legenda é feita de botões (funciona no teclado).
export function InteractiveDonut({ items, centerLabel, onSelect, selected, size = 200, format = brl, legend = true }: {
  items: DonutItem[]
  centerLabel: string
  onSelect?: (id: string) => void
  selected?: string | null
  size?: number
  format?: (v: number) => string
  legend?: boolean
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = items.reduce((s, i) => s + Math.max(i.value, 0), 0)
  const ativo = items.find(i => i.id === (hover ?? selected)) ?? null
  const centro = useCountUp(ativo ? ativo.value : total)
  const cx = size / 2, cy = size / 2, r1 = size / 2 - 8, r0 = r1 * 0.7
  const gap = items.length > 1 ? 0.025 : 0
  let a = 0
  const fatias = items.filter(i => i.value > 0).map(i => {
    const ang = (i.value / (total || 1)) * Math.PI * 2
    const s = { item: i, a0: a + gap, a1: a + ang - gap }
    a += ang
    return s
  })

  return (
    <div className="@container">
    <div className={`flex ${legend ? 'flex-col @[440px]:flex-row' : 'flex-col'} items-center gap-5`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${format(total)}`}>
          <defs>
            <filter id="donut-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.25" />
            </filter>
          </defs>
          <circle cx={cx} cy={cy} r={(r0 + r1) / 2} fill="none" stroke="var(--surface-2)" strokeWidth={r1 - r0} />
          {fatias.map(({ item, a0, a1 }) => {
            const on = ativo?.id === item.id
            const dim = !!ativo && !on
            return (
              <path key={item.id} d={arc(cx, cy, r0, r1, a0, Math.max(a1, a0 + 0.001))} fill={item.color}
                onMouseEnter={() => setHover(item.id)} onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(item.id)}
                filter={on ? 'url(#donut-glow)' : undefined}
                style={{
                  transformOrigin: `${cx}px ${cy}px`, transform: on ? 'scale(1.06)' : 'scale(1)',
                  opacity: dim ? 0.35 : 1, transition: 'transform .2s ease, opacity .2s ease',
                  cursor: onSelect ? 'pointer' : 'default',
                }} />
            )
          })}
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none" style={{ inset: size * 0.2 }}>
          <p className="text-[11px] text-muted leading-tight line-clamp-2">{ativo ? ativo.label : centerLabel}</p>
          <p className="num font-semibold text-ink text-[15px] leading-tight mt-0.5 whitespace-nowrap">{format(centro)}</p>
          {ativo && total > 0 && <p className="text-[11px] font-medium mt-0.5" style={{ color: ativo.color }}>{pct(ativo.value / total)}</p>}
        </div>
      </div>
      {legend && (
        <ul className="flex-1 w-full min-w-0 flex flex-col gap-0.5">
          {items.map(i => {
            const on = ativo?.id === i.id
            return (
              <li key={i.id}>
                <button type="button" onMouseEnter={() => setHover(i.id)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i.id)} onBlur={() => setHover(null)}
                  onClick={() => onSelect?.(i.id)} aria-pressed={selected === i.id}
                  className="w-full flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 text-sm transition-colors"
                  style={{ background: on ? 'color-mix(in srgb, ' + i.color + ' 10%, transparent)' : undefined }}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: i.color }} />
                    <span className="truncate text-ink">{i.label}</span>
                  </span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span className="num font-medium text-ink">{format(i.value)}</span>
                    <span className="num text-[11px] text-muted w-9 text-right">{total ? pct(i.value / total) : '—'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
    </div>
  )
}
