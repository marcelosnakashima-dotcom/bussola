import { useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisProps, gridProps } from '@/components/charts/kit'
import { axisCompact, brl, pct } from '@/lib/format'
import { projecaoFimDoMes } from '@/lib/finance'

// Ritmo do mês: acumulado diário contra o mês anterior, com projeção até o fim do mês
// (quando o mês está em andamento). Passar o mouse compara os dois meses no mesmo dia.
export function CumulativeChart({ atual, anterior, labelAtual, labelAnterior, ateDia, color = 'var(--danger)', height = 240 }: {
  atual: (number | null)[]
  anterior: (number | null)[]
  labelAtual: string
  labelAnterior: string
  ateDia?: number
  color?: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const dias = Math.max(atual.length, anterior.length)
  const ultimo = ateDia ?? atual.length
  const acumuladoHoje = Number(atual[ultimo - 1] ?? 0)
  const projetado = ateDia ? projecaoFimDoMes(acumuladoHoje, ateDia, atual.length) : null
  const data = Array.from({ length: dias }, (_, i) => {
    const dia = i + 1
    const proj = projetado !== null && ateDia && dia >= ateDia
      ? acumuladoHoje + ((projetado - acumuladoHoje) * (dia - ateDia)) / Math.max(atual.length - ateDia, 1)
      : null
    return { dia, atual: atual[i] ?? null, anterior: anterior[i] ?? null, proj }
  })
  const h = hover ? data[hover - 1] : null
  const dif = h && h.atual !== null && h.anterior ? (h.atual - h.anterior) / h.anterior : null
  const gid = `cum-${labelAtual.replace(/\W+/g, '')}`

  return (
    <div>
      <div className="rounded-2xl bg-surface-2/70 px-4 py-3 mb-3 min-h-[60px]" aria-live="polite">
        {h ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 items-end">
            <div><p className="text-[11px] text-muted">Até o dia {h.dia}</p><p className="num font-semibold text-ink">{h.atual !== null ? brl(h.atual) : brl(h.proj ?? 0) + ' (projeção)'}</p></div>
            <div><p className="text-[11px] text-muted">{labelAnterior}, mesmo dia</p><p className="num font-medium text-muted">{brl(h.anterior ?? 0)}</p></div>
            {dif !== null && (
              <p className="text-xs font-semibold px-2 py-0.5 rounded-full mb-0.5" style={{ color: dif > 0 ? 'var(--danger)' : 'var(--success)', background: dif > 0 ? 'var(--danger-soft)' : 'var(--success-soft)' }}>
                {dif > 0 ? '+' : ''}{pct(dif)} vs {labelAnterior}
              </p>
            )}
          </div>
        ) : projetado !== null ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div><p className="text-[11px] text-muted">Gasto até hoje</p><p className="num font-semibold text-ink">{brl(acumuladoHoje)}</p></div>
            <div><p className="text-[11px] text-muted">Projeção para o fim do mês</p><p className="num font-semibold" style={{ color }}>{brl(projetado)}</p></div>
          </div>
        ) : (
          <div><p className="text-[11px] text-muted">Total do mês</p><p className="num font-semibold text-ink">{brl(acumuladoHoje)}</p></div>
        )}
      </div>
      <div style={{ height }} role="img" aria-label={`Acumulado diário: ${labelAtual} contra ${labelAnterior}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            onMouseMove={(e: any) => setHover(e?.activeLabel ? Number(e.activeLabel) : null)} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="dia" {...axisProps} interval={4} />
            <YAxis {...axisProps} tickFormatter={axisCompact} width={56} />
            <Tooltip content={() => null} cursor={{ stroke: 'var(--ink)', strokeOpacity: 0.25, strokeDasharray: '3 3' }} />
            <Line type="monotone" dataKey="anterior" name={labelAnterior} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            <Area type="monotone" dataKey="atual" name={labelAtual} stroke={color} strokeWidth={2.5} fill={`url(#${gid})`} dot={false} activeDot={{ r: 5, fill: color, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls={false} />
            {projetado !== null && <Line type="monotone" dataKey="proj" name="Projeção" stroke={color} strokeOpacity={0.6} strokeDasharray="2 5" strokeWidth={2} dot={false} activeDot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: color }} />{labelAtual}</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed" style={{ borderColor: 'var(--muted)' }} />{labelAnterior}</span>
        {projetado !== null && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dotted" style={{ borderColor: color }} />projeção</span>}
      </div>
    </div>
  )
}
