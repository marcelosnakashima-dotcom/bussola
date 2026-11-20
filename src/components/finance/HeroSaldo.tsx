import { useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useCountUp } from '@/hooks/useCountUp'
import { brl, pct } from '@/lib/format'
import { monthLabel, type MesSerie } from '@/lib/finance'

// Cartão de destaque: quanto sobrou no mês, taxa de poupança e o saldo dos últimos 12 meses.
// Passar o mouse no gráfico troca o número grande pelo do mês em foco.
export function HeroSaldo({ serie, mes, patrimonio }: { serie: MesSerie[]; mes: string; patrimonio: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const foco = serie.find(s => s.mes === (hover ?? mes)) ?? serie[serie.length - 1]
  const saldo = useCountUp(foco?.saldo ?? 0)
  const patr = useCountUp(patrimonio)
  const taxa = foco && foco.receitas > 0 ? foco.saldo / foco.receitas : null

  return (
    <section className="hero rounded-3xl p-6 md:p-7 grid md:grid-cols-[1fr_1.4fr] gap-6 items-end">
      <div className="relative z-10">
        <p className="text-xs text-white/60">{hover ? 'Sobrou em' : 'Sobrou no mês'} · {foco ? monthLabel(foco.mes) : ''}</p>
        <p className="num font-display text-4xl md:text-5xl mt-1 leading-none">{brl(saldo)}</p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {taxa !== null && (
            <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-white/12 border border-white/15">
              {taxa >= 0 ? 'Poupou' : 'Gastou além'} {pct(Math.abs(taxa))} da renda
            </span>
          )}
          <span className="text-xs rounded-full px-2.5 py-1 bg-white/12 border border-white/15">
            Patrimônio líquido <span className="num font-semibold">{brl(patr)}</span>
          </span>
        </div>
      </div>
      <div className="relative z-10 h-28 md:h-32 -mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}
            onMouseMove={(e: any) => setHover(e?.activeLabel ? String(e.activeLabel) : null)} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#fff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="mes" hide />
            <Tooltip content={() => null} cursor={{ stroke: 'rgba(255,255,255,0.5)', strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey="saldo" stroke="#fff" strokeWidth={2.5} fill="url(#hero-area)"
              dot={false} activeDot={{ r: 5, fill: '#fff', stroke: 'rgba(255,255,255,0.4)', strokeWidth: 6 }} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-white/50 text-right -mt-1">saldo dos últimos 12 meses · toque ou passe o mouse</p>
      </div>
    </section>
  )
}
