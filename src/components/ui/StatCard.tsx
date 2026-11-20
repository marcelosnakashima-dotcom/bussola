import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { Skeleton } from './Skeleton'

// Indicador com valor em destaque, variação contra o período anterior e mini-gráfico.
// `goodWhen` diz se subir é bom (receita, patrimônio) ou ruim (despesa).
export function StatCard({ label, value, delta, goodWhen = 'up', hint, icon: Icon, color = 'var(--brand)', spark, loading }: {
  label: string
  value: string
  delta?: number | null
  goodWhen?: 'up' | 'down'
  hint?: string
  icon?: LucideIcon
  color?: string
  spark?: number[]
  loading?: boolean
}) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const good = hasDelta && (goodWhen === 'up' ? delta! >= 0 : delta! <= 0)
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2 min-w-0"
      style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted truncate">{label}</p>
        {Icon && (
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-7 w-32" /> : (
        <p className="num text-[22px] md:text-2xl font-semibold text-ink leading-none truncate">{value}</p>
      )}
      <div className="flex items-end justify-between gap-2 min-h-[28px]">
        <div className="text-[11px] text-muted min-w-0">
          {hasDelta && !loading && (
            <span className="inline-flex items-center gap-0.5 font-semibold mr-1"
              style={{ color: good ? 'var(--success)' : 'var(--danger)' }}>
              {delta! >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(delta!).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
        {spark && spark.length > 1 && !loading && (
          <div className="w-20 h-7 shrink-0" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
