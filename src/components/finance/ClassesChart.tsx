import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CLASS_COLOR, CLASS_LABEL, ChartTooltip, LegendToggle, axisProps, gridProps } from '@/components/charts/kit'
import { axisCompact } from '@/lib/format'
import { monthLabel, type MesSerie } from '@/lib/finance'

const KEYS = [
  { key: 'necessidade', label: CLASS_LABEL.necessidade, color: CLASS_COLOR.necessidade },
  { key: 'desejo', label: CLASS_LABEL.desejo, color: CLASS_COLOR.desejo },
  { key: 'poupanca', label: CLASS_LABEL.poupanca, color: CLASS_COLOR.poupanca },
  { key: 'semClasse', label: 'Sem categoria', color: 'var(--muted)' },
]

// Despesas por mês empilhadas por grupo do 50/30/20. Clicar num mês abre o mês.
export function ClassesChart({ data, onSelect, height = 260 }: { data: MesSerie[]; onSelect?: (mes: string) => void; height?: number }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setHidden(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const visiveis = KEYS.filter(k => !hidden.has(k.key))
  return (
    <div>
      <div className="mb-3"><LegendToggle items={KEYS} hidden={hidden} onToggle={toggle} /></div>
      <div style={{ height }} role="img" aria-label="Despesas por mês, por grupo">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            onClick={(e: any) => { const mes = e?.activeLabel; if (mes && onSelect) onSelect(String(mes)) }}
            style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="mes" {...axisProps} tickFormatter={(m: string) => monthLabel(m, 'short')} />
            <YAxis {...axisProps} tickFormatter={axisCompact} width={56} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }}
              content={<ChartTooltip title={(l) => monthLabel(String(l))} />} />
            {visiveis.map((k, i) => (
              <Bar key={k.key} dataKey={k.key} name={k.label} stackId="a" fill={k.color} maxBarSize={32}
                radius={i === visiveis.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
