// Gráficos animados e interativos da Visão Geral, com Recharts.
//
// SaldoChart: evolução do saldo acumulado (área com gradiente) — autossuficiente,
// consulta a tabela `transactions` do usuário logado. Tem seletor de período
// (3/6/12 meses) e ponto atual pulsante.
// CategoriaChart: rosca colorida de gastos por categoria — recebe [{ nome, valor }].
// Fatia aumenta ao passar o mouse, legenda sincronizada, total com contagem animada.

import { useEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Sector,
} from 'recharts'
import { supabase, currentUserId } from '@/lib/supabase'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const mesLabel = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] ?? ym

export const DEFAULT_PALETTE = [
  '#2A6049', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6',
  '#14B8A6', '#EF4444', '#84CC16', '#6366F1', '#F97316',
]

// ---- contagem animada de um número (ease-out) ----
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target)
  const prevRef = useRef(target)
  const firstRef = useRef(true)

  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; prevRef.current = target; setValue(target); return }
    const from = prevRef.current
    const to = target
    if (from === to) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

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
// Evolução do saldo (área, gradiente, seletor de período)
// =====================================================================
export function SaldoChart({ meses: mesesProp = 6 }: { meses?: number }) {
  const [meses, setMeses]     = useState(mesesProp)
  const [full, setFull]       = useState<{ label: string; saldo: number }[]>([])
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
        const key = String(t.data).slice(0, 7)
        const delta = t.tipo === 'receita' ? Number(t.valor) : -Number(t.valor)
        porMes.set(key, (porMes.get(key) ?? 0) + delta)
      }
      let acc = 0
      const serie = [...porMes.keys()].sort().map(k => {
        acc += porMes.get(k)!
        return { label: mesLabel(k), saldo: Math.round(acc) }
      })
      setFull(serie)
      setLoading(false)
    })()
  }, [])

  const serie     = full.slice(-meses)
  const atual     = serie.length ? serie[serie.length - 1].saldo : 0
  const anterior  = serie.length > 1 ? serie[serie.length - 2].saldo : 0
  const variacao  = atual - anterior
  const atualAnimado = useCountUp(atual)

  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div>
          <p className="text-[13px]" style={{ color: 'var(--muted)' }}>Evolução do saldo</p>
          <p className="text-2xl font-medium mt-1" style={{ color: 'var(--ink)' }}>{brl(atualAnimado)}</p>
          {serie.length > 1 && (
            <span className="text-xs" style={{ color: variacao >= 0 ? 'var(--brand)' : '#DC2626' }}>
              {variacao >= 0 ? '↑' : '↓'} {brl(Math.abs(variacao))} no mês
            </span>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {[3, 6, 12].map(m => (
            <button key={m} onClick={() => setMeses(m)}
              className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                background: meses === m ? 'var(--brand)' : 'transparent',
                color: meses === m ? '#fff' : 'var(--muted)',
                border: meses === m ? 'none' : '1px solid var(--border)',
              }}>
              {m}m
            </button>
          ))}
        </div>
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
                <stop offset="0%" stopColor="#2A6049" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#2A6049" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="saldoStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#4A8C67" />
                <stop offset="100%" stopColor="#1E4535" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(23,34,27,0.08)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: '#6B7280', fontSize: 11 }}
              tickFormatter={(v) => 'R$ ' + v / 1000 + 'k'} />
            <Tooltip content={<DarkTooltip prefix="Saldo" />}
              cursor={{ stroke: '#2A6049', strokeDasharray: '3 3', strokeOpacity: 0.4 }} />
            <Area
              type="monotone" dataKey="saldo" stroke="url(#saldoStroke)" strokeWidth={2.75}
              fill="url(#saldoFill)" animationDuration={1100} animationEasing="ease-out"
              activeDot={{ r: 5, fill: '#fff', stroke: '#2A6049', strokeWidth: 2 }}
              dot={(props: any) =>
                props.index === serie.length - 1 ? (
                  <g key="last">
                    <circle cx={props.cx} cy={props.cy} r={5} fill="#fff" stroke="#2A6049" strokeWidth={2} />
                    <circle cx={props.cx} cy={props.cy} r={5} fill="none" stroke="#2A6049" strokeWidth={2} opacity={0.55}>
                      <animate attributeName="r" values="5;13;5" dur="2.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.55;0;0.55" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                  </g>
                ) : <g key={props.index} />
              }
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// =====================================================================
// Gastos por categoria (rosca colorida e interativa)
// =====================================================================
function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 9}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 12} outerRadius={outerRadius + 14}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.5} />
    </g>
  )
}

export function CategoriaChart({ data = [], colors = DEFAULT_PALETTE, titulo = 'Gastos por categoria' }: {
  data?: { nome: string; valor: number }[]
  colors?: string[]
  titulo?: string
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const itens = [...data].filter(d => d.valor > 0).sort((a, b) => b.valor - a.valor)
  const total = itens.reduce((s, d) => s + d.valor, 0)
  const totalAnimado = useCountUp(total)

  const pieExtraProps = {
    activeIndex: activeIndex ?? undefined,
    activeShape: ActiveSlice,
  } as any

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
                <Pie
                  data={itens} dataKey="valor" nameKey="nome" innerRadius={62} outerRadius={92}
                  paddingAngle={3} stroke="none" animationDuration={850} animationEasing="ease-out"
                  onMouseEnter={(_: any, i: number) => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  {...pieExtraProps}
                >
                  {itens.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]}
                      opacity={activeIndex === null || activeIndex === i ? 1 : 0.35}
                      style={{ transition: 'opacity 200ms', cursor: 'pointer' }} />
                  ))}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-medium" style={{ color: 'var(--ink)' }}>{brl(totalAnimado)}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>gastos do mês</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3.5">
            {itens.map((d, i) => (
              <span key={d.nome}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                className="flex items-center gap-1.5 text-xs min-w-0 cursor-pointer rounded px-1 -mx-1 transition-colors"
                style={{
                  color: 'var(--muted)',
                  background: activeIndex === i ? 'var(--canvas)' : 'transparent',
                }}>
                <span className="w-2.5 h-2.5 rounded flex-shrink-0 transition-transform"
                  style={{ background: colors[i % colors.length], transform: activeIndex === i ? 'scale(1.25)' : 'scale(1)' }} />
                <span className="flex-1 truncate" style={{ color: 'var(--ink)', fontWeight: activeIndex === i ? 600 : 400 }}>
                  {d.nome}
                </span>
                <span className="font-mono flex-shrink-0">{Math.round((d.valor / total) * 100)}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
