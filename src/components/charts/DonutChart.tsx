interface Slice { valor: number; nome: string; id: string }

interface Props {
  data: Slice[]
  colors: string[]
  size?: number
}

export function DonutChart({ data, colors, size = 160 }: Props) {
  const total = data.reduce((s, d) => s + d.valor, 0)
  if (total === 0) return null

  const cx = size / 2
  const cy = size / 2
  const R  = size * 0.42
  const r  = size * 0.26

  let angle = -Math.PI / 2

  const slices = data.map((d, i) => {
    const pct   = d.valor / total
    const sweep = pct * 2 * Math.PI
    const x1 = cx + R * Math.cos(angle)
    const y1 = cy + R * Math.sin(angle)
    angle += sweep
    const x2 = cx + R * Math.cos(angle)
    const y2 = cy + R * Math.sin(angle)
    const ix1 = cx + r * Math.cos(angle)
    const iy1 = cy + r * Math.sin(angle)
    angle -= sweep
    const ix2 = cx + r * Math.cos(angle)
    const iy2 = cy + r * Math.sin(angle)
    angle += sweep
    const large = sweep > Math.PI ? 1 : 0
    return {
      d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`,
      color: colors[i % colors.length],
    }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth={1.5} />
      ))}
    </svg>
  )
}
