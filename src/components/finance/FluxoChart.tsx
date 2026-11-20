import { useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { LegendToggle, axisProps, gridProps } from '@/components/charts/kit'
import { useCountUp } from '@/hooks/useCountUp'
import { axisCompact, brl, pct } from '@/lib/format'
import { monthLabel, type MesSerie } from '@/lib/finance'

const SERIES = [
  { key: 'receitas', label: 'Receitas', color: 'var(--success)' },
  { key: 'despesas', label: 'Despesas', color: 'var(--danger)' },
  { key: 'saldo', label: 'Saldo', color: 'var(--ink)' },
]

function Valor({ label, v, color }: { label: string; v: number; color: string }) {
  const a = useCountUp(v, 450)
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}</p>
      <p className="num text-sm md:text-base font-semibold text-ink truncate">{brl(a)}</p>
    </div>
  )
}

// Receitas x despesas por mês com a linha do saldo. Passar o mouse num mês atualiza o
// painel de números acima do gráfico; clicar seleciona o mês na página.
export function FluxoChart({ data, selected, onSelect, height = 260 }: {
  data: MesSerie[]
  selected?: string
  onSelect?: (mes: string) => void
  height?: number
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<string | null>(null)
  const toggle = (k: string) => setHidden(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const foco = data.find(d => d.mes === (hover ?? selected)) ?? data[data.length - 1]
  const taxa = foco && foco.receitas > 0 ? foco.saldo / foco.receitas : null
  const destaque = hover ?? selected
  const op = (mes: string) => (!destaque || mes === destaque ? 1 : 0.4)

  return (
    <div>
      {foco && (
        <div className="rounded-2xl bg-surface-2/70 px-4 py-3 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3" aria-live="polite">
          <div className="col-span-2 md:col-span-1">
            <p className="text-[11px] text-muted">{hover ? 'Mês em foco' : 'Mês selecionado'}</p>
            <p className="text-sm md:text-base font-semibold text-ink">{monthLabel(foco.mes)}</p>
          </div>
          <Valor label="Receitas" v={foco.receitas} color="var(--success)" />
          <Valor label="Despesas" v={foco.despesas} color="var(--danger)" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted">Saldo{taxa !== null && <> · <span style={{ color: taxa >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pct(taxa)} da renda</span></>}</p>
            <p className="num text-sm md:text-base font-semibold truncate" style={{ color: foco.saldo >= 0 ? 'var(--ink)' : 'var(--danger)' }}>{brl(foco.saldo)}</p>
          </div>
        </div>
      )}
      <div className="mb-3"><LegendToggle items={SERIES} hidden={hidden} onToggle={toggle} /></div>
      <div style={{ height }} role="img" aria-label="Gráfico de receitas, despesas e saldo por mês">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={3}
            onMouseMove={(e: any) => setHover(e?.activeLabel ? String(e.activeLabel) : null)}
            onMouseLeave={() => setHover(null)}
            onClick={(e: any) => { const mes = e?.activeLabel; if (mes && onSelect) onSelect(String(mes)) }}
            style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <defs>
              <linearGradient id="fx-rec" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--success)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--success)" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="fx-desp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--danger)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="mes" {...axisProps} tickFormatter={(m: string) => monthLabel(m, 'short')} interval="preserveStartEnd" />
            <YAxis {...axisProps} tickFormatter={axisCompact} width={56} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip content={() => null} cursor={{ fill: 'color-mix(in srgb, var(--brand) 8%, transparent)', radius: 10 }} />
            {!hidden.has('receitas') && (
              <Bar dataKey="receitas" name="Receitas" fill="url(#fx-rec)" radius={[8, 8, 2, 2]} maxBarSize={20}>
                {data.map(d => <Cell key={d.mes} fillOpacity={op(d.mes)} />)}
              </Bar>
            )}
            {!hidden.has('despesas') && (
              <Bar dataKey="despesas" name="Despesas" fill="url(#fx-desp)" radius={[8, 8, 2, 2]} maxBarSize={20}>
                {data.map(d => <Cell key={d.mes} fillOpacity={op(d.mes)} />)}
              </Bar>
            )}
            {!hidden.has('saldo') && (
              <Line type="monotone" dataKey="saldo" name="Saldo" stroke="var(--ink)" strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--surface)', stroke: 'var(--ink)', strokeWidth: 2 }} activeDot={{ r: 6, fill: 'var(--ink)', stroke: 'var(--surface)', strokeWidth: 2 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
