// Gráficos animados da Visão Geral, com Recharts.
//
// SaldoChart: evolução do saldo acumulado (área animada) — autossuficiente,
// consulta a tabela `transactions` do usuário logado nos últimos meses.
// CategoriaChart: rosca animada de gastos por categoria — recebe [{ nome, valor }],
// o mesmo formato que `useCategoryTotals` já devolve.

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'
import { supabase, currentUserId } from '@/lib/supabase'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const mesLabel = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] ?? ym

const DEFAULT_PALETTE = [
  '#2A6049', '#3C7A5C', '#1E4535', '#6B9E80', '#4A8C67',
  '#8BBF9F', '#2E7D52', '#5A9E72', '#1A5C3A', '#7BB89A',
]

function DarkTooltip({ active, payload, label, prefix }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg px-2.5 py-2 text-xs" style={{ background: 'var(--ink)', color: '#EDEAE0' }}>
      {label && <div className="opacity-70 mb-0.5">{label}</div>}
      <div>{prefix ?? p.name}: {brl(p.value)}</div>
    </div>
  )
}

// =====================================================================
// Evolução do saldo (área) — busca os últimos meses sozinho
// =====================================================================
export function SaldoChart({ meses = 6 }: { meses?: number }) {
  const [serie, setSerie]     = useState<{ label: string; saldo: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const userId = await currentUserId()
      if (!userId) { setLoading(false); return }

      const { data } = await supabase
        .from('transactions')
        .select('data, valor, tipo')
        .eq('user_id', userId)
        .eq('status', 'confirmada')
        .order('data', { ascending: true })

      const porMes = new Map<string, number>()
      for (const t of data ?? []) {
        const key = String(t.data).slice(0, 7) // YYYY-MM
        const delta = t.tipo === 'receita' ? Number(t.valor) : -Number(t.valor)
        porMes.set(key, (porMes.get(key) ?? 0) + delta)
      }
      let acc = 0
      const full = [...porMes.keys()].sort().map(k => {
        acc += porMes.get(k)!
        return { label: mesLabel(k), saldo: Math.round(acc) }
      })
      setSerie(full.slice(-meses))
      setLoading(false)
    })()
  }, [meses])

  const atual    = serie.length ? serie[serie.length - 1].saldo : 0
  const anterior = serie.length > 1 ? serie[serie.length - 2].saldo : 0
  const variacao = atual - anterior

  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-3.5">
        <p className="text-[13px]" style={{ color: 'var(--muted)' }}>Evolução do saldo</p>
        <p className="text-2xl font-medium mt-1" style={{ color: 'var(--ink)' }}>{brl(atual)}</p>
        {serie.length > 1 && (
          <span className="text-xs" style={{ color: variacao >= 0 ? 'var(--brand)' : '#DC2626' }}>
            {variacao >= 0 ? '↑' : '↓'} {brl(Math.abs(variacao))} no mês
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
          Carregando…
        </div>
      ) : serie.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-center px-4" style={{ color: 'var(--muted)' }}>
          Ainda sem lançamentos para exibir.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={serie} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2A6049" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#2A6049" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(23,34,27,0.08)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: '#6B7280', fontSize: 11 }}
              tickFormatter={(v) => 'R$ ' + v / 1000 + 'k'} />
            <Tooltip content={<DarkTooltip prefix="Saldo" />} />
            <Area
              type="monotone" dataKey="saldo" stroke="#2A6049" strokeWidth={2.5}
              fill="url(#saldoFill)" animationDuration={900}
              activeDot={{ r: 5, fill: '#fff', stroke: '#2A6049', strokeWidth: 2 }}
              dot={(props: any) =>
                props.index === serie.length - 1
                  ? <circle key="last" cx={props.cx} cy={props.cy} r={5} fill="#fff" stroke="#2A6049" strokeWidth={2} />
                  : <g key={props.index} />
              }
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// =====================================================================
// Gastos por categoria (rosca) — recebe [{ nome, valor }]
// =====================================================================
export function CategoriaChart({ data = [], colors = DEFAULT_PALETTE, titulo = 'Gastos por categoria' }: {
  data?: { nome: string; valor: number }[]
  colors?: string[]
  titulo?: string
}) {
  const itens = [...data].filter(d => d.valor > 0).sort((a, b) => b.valor - a.valor)
  const total = itens.reduce((s, d) => s + d.valor, 0)

  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
      <h3 className="font-display text-lg mb-4" style={{ color: 'var(--ink)' }}>{titulo}</h3>

      {itens.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>Sem gastos neste mês.</p>
      ) : (
        <>
          <div className="relative w-full" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={itens} dataKey="valor" nameKey="nome" innerRadius={62} outerRadius={92}
                  paddingAngle={2} stroke="none" animationDuration={800}>
                  {itens.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-medium" style={{ color: 'var(--ink)' }}>{brl(total)}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>gastos do mês</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3.5">
            {itens.map((d, i) => (
              <span key={d.nome} className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: 'var(--muted)' }}>
                <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ background: colors[i % colors.length] }} />
                <span className="flex-1 truncate" style={{ color: 'var(--ink)' }}>{d.nome}</span>
                <span className="font-mono flex-shrink-0">{Math.round((d.valor / total) * 100)}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
