import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Skeleton } from './Skeleton'
import { useCountUp } from '@/hooks/useCountUp'
import { brl } from '@/lib/format'

// Indicador em vidro: valor animado, variação contra o período anterior e mini-gráfico
// que mostra o valor de cada ponto ao passar o mouse. `goodWhen`: subir é bom ou ruim.
export function StatCard({ label, value, money, delta, goodWhen = 'up', hint, icon: Icon, color = 'var(--brand)', spark, sparkLabels, loading }: {
  label: string
  value?: string
  money?: number
  delta?: number | null
  goodWhen?: 'up' | 'down'
  hint?: string
  icon?: LucideIcon
  color?: string
  spark?: number[]
  sparkLabels?: string[]
  loading?: boolean
}) {
  const animado = useCountUp(money ?? 0)
  const texto = money !== undefined ? brl(animado) : value ?? '—'
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const good = hasDelta && (goodWhen === 'up' ? delta! >= 0 : delta! <= 0)
  const gid = `sg-${label.replace(/\W+/g, '')}`
  return (
    <div className="glass rounded-3xl p-4 md:p-5 flex flex-col gap-2 min-w-0 lift">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted truncate">{label}</p>
        {Icon && (
          <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-7 w-32" /> : (
        <p className="num text-lg sm:text-[22px] md:text-2xl font-semibold text-ink leading-tight break-words">{texto}</p>
      )}
      <div className="text-[11px] text-muted min-w-0 flex flex-wrap items-center gap-x-1">
        {hasDelta && !loading && (
          <span className="inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-full"
            style={{ color: good ? 'var(--success)' : 'var(--danger)', background: good ? 'var(--success-soft)' : 'var(--danger-soft)' }}>
            {delta! >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(delta!).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
          </span>
        )}
        {hint && <span className="truncate max-w-full">{hint}</span>}
      </div>
      {spark && spark.length > 1 && !loading && (
        <div className="h-10 -mx-1 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v, l: sparkLabels?.[i] ?? '' }))} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip cursor={{ stroke: color, strokeOpacity: 0.3 }} isAnimationActive={false}
                content={({ active, payload }) => active && payload?.length ? (
                  <div className="glass rounded-lg px-2 py-1 text-[11px] text-ink">
                    {String((payload[0].payload as { l: string }).l)} · <span className="num font-medium">{brl(Number(payload[0].value))}</span>
                  </div>
                ) : null} />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gid})`}
                activeDot={{ r: 3.5, fill: color, stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
