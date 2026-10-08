import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { CalendarCheck, AlertTriangle, Lock, Unlock } from 'lucide-react'
import { usePlano, type Cobertura } from '@/hooks/usePlano'
import { useUserRole } from '@/hooks/useData'
import {
  BASES_RENDA, CENARIOS, compararCenarios, desejosDoMes, historicoFechado, projetar, rotuloMes,
  type BaseRenda, type Cenario, type PlanoEntrada,
} from '@/lib/planoForecast'

const COR = { necessidade: '#2A6049', divida: '#17221B', desejo: '#D97706', futuro: '#2563EB', receita: '#8B5CF6' }
const brl0 = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const sinal = (n: number) => (n >= 0 ? 'var(--brand)' : '#B91C1C')

export function PlanoPage() {
  const { dados, semPlano, loading, error, fecharMes } = usePlano()
  const { isAdmin } = useUserRole()

  if (loading) return <div className="p-8 text-sm" style={{ color: 'var(--muted)' }}>Carregando o plano…</div>
  if (error) return <div className="p-8 text-sm text-red-700">Não foi possível carregar o plano: {error}</div>
  if (semPlano || !dados) {
    return (
      <div className="p-4 md:p-8 max-w-screen-md mx-auto">
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>Plano e forecast</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          O plano financeiro ainda não foi publicado para este grupo familiar. Quando a Arsen concluir a
          construção do plano, ele aparece aqui e se atualiza a cada extrato importado.
        </p>
      </div>
    )
  }
  return <PlanoView entrada={dados.entrada} cobertura={dados.cobertura} coberturaMes={dados.coberturaMes} isAdmin={isAdmin} onFechar={fecharMes} />
}

export interface PlanoViewProps {
  entrada: PlanoEntrada
  cobertura: Cobertura | null
  coberturaMes: string | null
  isAdmin: boolean
  onFechar: (mes: string, fechar: boolean) => Promise<void>
  hoje?: Date
}

export function PlanoView({ entrada, cobertura, coberturaMes, isAdmin, onFechar, hoje }: PlanoViewProps) {
  const [cenario, setCenario] = useState<Cenario>('plano')
  const [base, setBase] = useState<BaseRenda>('tipica')
  const [acaoErro, setAcaoErro] = useState<string | null>(null)

  const calc = useMemo(() => {
    const proj = projetar(entrada, cenario, base)
    return {
      proj,
      cenarios: compararCenarios(entrada, base),
      desejos: desejosDoMes(entrada, proj.mesCorrente, hoje ?? new Date()),
      historico: historicoFechado(entrada),
    }
  }, [entrada, cenario, base, hoje])

  const { proj, cenarios, desejos, historico } = calc
  const { janela, mesCorrente, planoCompleto } = proj
  const primeiro = janela[0]
  const ultimo = janela[janela.length - 1]
  const faltamExtratos = cobertura != null && cobertura.contasAtivas > 0 && cobertura.contasComLote < cobertura.contasAtivas
  const dadosGrafico = janela.map(m => ({
    mes: rotuloMes(m.mes),
    Necessidades: Math.round(m.necessidade),
    Dívidas: Math.round(m.divida),
    Desejos: Math.round(m.desejo),
    Futuro: Math.round(m.futuro),
    Receitas: Math.round(m.receita),
  }))
  const pctMeta = ultimo && ultimo.metaReserva > 0 ? ultimo.reservaFim / ultimo.metaReserva : 0

  const alternarFechamento = async (fechar: boolean) => {
    setAcaoErro(null)
    try {
      const ultimoFechado = [...entrada.fechados].sort().pop()
      await onFechar(fechar ? mesCorrente : ultimoFechado ?? mesCorrente, fechar)
    } catch (e: any) {
      setAcaoErro(e?.message ?? 'Não foi possível atualizar o mês')
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-screen-lg mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>Plano e forecast</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Próximos 12 meses a partir de {rotuloMes(mesCorrente, false)}, atualizados com os extratos que vocês importam.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs" style={{ color: 'var(--muted)' }}>
            Cenário
            <select value={cenario} onChange={e => setCenario(e.target.value as Cenario)}
              className="block mt-1 rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              {CENARIOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: 'var(--muted)' }}>
            Renda considerada
            <select value={base} onChange={e => setBase(e.target.value as BaseRenda)}
              className="block mt-1 rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              {BASES_RENDA.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <p className="text-xs -mt-3" style={{ color: 'var(--muted)' }}>{CENARIOS.find(c => c.id === cenario)?.desc}</p>

      {planoCompleto && (
        <div className="rounded-2xl border bg-white p-4 text-sm" style={{ borderColor: 'var(--border)' }}>
          Todos os meses do plano foram fechados. Combine com a Arsen o próximo ciclo de planejamento.
        </div>
      )}

      {faltamExtratos && cobertura && (
        <div className="rounded-2xl border p-4 flex gap-3 text-sm" style={{ borderColor: '#F59E0B', background: '#FFFBEB', color: '#92400E' }}>
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            Faltam extratos de {rotuloMes(coberturaMes ?? mesCorrente, false)}: {cobertura.contasComLote} de {cobertura.contasAtivas} contas
            e cartões têm lançamentos importados. Importe os demais em <b>Importar despesas</b> para o realizado ficar completo.
          </p>
        </div>
      )}

      {janela.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Não há meses restantes no plano para projetar.</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi titulo="Folga do mês" valor={brl0(primeiro.folga)} cor={sinal(primeiro.folga)} sub={`Receitas ${brl0(primeiro.receita)} · despesas ${brl0(primeiro.despesas)}`} />
            <Kpi titulo="Folga média (12 meses)" valor={brl0(janela.reduce((s, m) => s + m.folga, 0) / janela.length)} cor={sinal(janela.reduce((s, m) => s + m.folga, 0))} sub="Receitas menos despesas" />
            <Kpi titulo="Reserva ao fim da janela" valor={brl0(ultimo.reservaFim)} cor="var(--ink)" sub={`Meta ${brl0(ultimo.metaReserva)} (${Math.round(pctMeta * 100)}%)`} />
            <Kpi titulo="Reserva alcança a meta" valor={mesMeta(cenarios.find(c => c.cenario === cenario)?.mesDaMeta ?? null)} cor="var(--ink)" sub={`${entrada.config.metaReservaMeses} meses de necessidades`} />
          </div>

          {/* Gráfico */}
          <section className="rounded-2xl border bg-white p-4 md:p-5" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-display text-lg mb-3" style={{ color: 'var(--ink)' }}>Receitas e despesas por mês</h2>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart data={dadosGrafico} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD4" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} width={40} />
                  <Tooltip formatter={(v: any) => brl0(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Necessidades" stackId="d" fill={COR.necessidade} />
                  <Bar dataKey="Dívidas" stackId="d" fill={COR.divida} />
                  <Bar dataKey="Desejos" stackId="d" fill={COR.desejo} />
                  <Bar dataKey="Futuro" stackId="d" fill={COR.futuro} />
                  <Line type="monotone" dataKey="Receitas" stroke={COR.receita} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Desejos do mês */}
          {desejos.length > 0 && (
            <section className="rounded-2xl border bg-white p-4 md:p-5" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Desejos de {rotuloMes(mesCorrente, false)} contra o teto</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>Realizado das transações importadas até agora.</p>
              <div className="space-y-3">
                {desejos.map(d => {
                  const pct = Number.isFinite(d.pct) ? d.pct : 1
                  return (
                    <div key={d.chave}>
                      <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--ink)' }}>{d.rotulo}</span>
                        <span style={{ color: pct > 1 ? '#B91C1C' : 'var(--muted)' }}>{brl0(d.realizado)} de {brl0(d.teto)}</span>
                      </div>
                      <div className="h-2 rounded-full mt-1" style={{ background: '#EFEAE0' }}>
                        <div className="h-2 rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: pct > 1 ? '#B91C1C' : pct > 0.8 ? '#D97706' : 'var(--brand)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Tabela da janela */}
          <section className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-display text-lg p-4 md:p-5 pb-2" style={{ color: 'var(--ink)' }}>Janela de 12 meses</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-left" style={{ color: 'var(--muted)' }}>
                    <th className="px-4 py-2 font-medium">Mês</th>
                    <th className="px-2 py-2 font-medium text-right">Receitas</th>
                    <th className="px-2 py-2 font-medium text-right">Necessidades</th>
                    <th className="px-2 py-2 font-medium text-right">Dívidas</th>
                    <th className="px-2 py-2 font-medium text-right">Desejos</th>
                    <th className="px-2 py-2 font-medium text-right">Futuro</th>
                    <th className="px-2 py-2 font-medium text-right">Folga</th>
                    <th className="px-4 py-2 font-medium text-right">Reserva</th>
                  </tr>
                </thead>
                <tbody>
                  {janela.map(m => (
                    <tr key={m.mes} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-2 whitespace-nowrap">{rotuloMes(m.mes)}</td>
                      <td className="px-2 py-2 text-right">{brl0(m.receita)}</td>
                      <td className="px-2 py-2 text-right">{brl0(m.necessidade)}</td>
                      <td className="px-2 py-2 text-right">{brl0(m.divida)}</td>
                      <td className="px-2 py-2 text-right">{brl0(m.desejo)}</td>
                      <td className="px-2 py-2 text-right">{brl0(m.futuro)}</td>
                      <td className="px-2 py-2 text-right font-medium" style={{ color: sinal(m.folga) }}>{brl0(m.folga)}</td>
                      <td className="px-4 py-2 text-right">{brl0(m.reservaFim)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Comparação de cenários */}
          <section className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-display text-lg p-4 md:p-5 pb-2" style={{ color: 'var(--ink)' }}>Cenários lado a lado</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-left" style={{ color: 'var(--muted)' }}>
                    <th className="px-4 py-2 font-medium">Cenário</th>
                    <th className="px-2 py-2 font-medium text-right">Folga média</th>
                    <th className="px-2 py-2 font-medium text-right">Reserva final</th>
                    <th className="px-4 py-2 font-medium text-right">Alcança a meta</th>
                  </tr>
                </thead>
                <tbody>
                  {cenarios.map(c => (
                    <tr key={c.cenario} className="border-t" style={{ borderColor: 'var(--border)', background: c.cenario === cenario ? '#F5F0E8' : undefined }}>
                      <td className="px-4 py-2">{CENARIOS.find(x => x.id === c.cenario)?.label}</td>
                      <td className="px-2 py-2 text-right" style={{ color: sinal(c.folgaMedia) }}>{brl0(c.folgaMedia)}</td>
                      <td className="px-2 py-2 text-right">{brl0(c.reservaFinal)}</td>
                      <td className="px-4 py-2 text-right">{mesMeta(c.mesDaMeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Histórico fechado */}
      {historico.length > 0 && (
        <section className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-display text-lg p-4 md:p-5 pb-2 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <CalendarCheck size={18} /> Meses fechados: realizado contra o plano
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-left" style={{ color: 'var(--muted)' }}>
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-2 py-2 font-medium text-right">Despesas (plano)</th>
                  <th className="px-2 py-2 font-medium text-right">Despesas (real)</th>
                  <th className="px-2 py-2 font-medium text-right">Folga (plano)</th>
                  <th className="px-4 py-2 font-medium text-right">Folga (real)</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(h => (
                  <tr key={h.mes} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2">{rotuloMes(h.mes)}</td>
                    <td className="px-2 py-2 text-right">{brl0(h.despesaPlano)}</td>
                    <td className="px-2 py-2 text-right">{brl0(h.despesaReal)}</td>
                    <td className="px-2 py-2 text-right">{brl0(h.folgaPlano)}</td>
                    <td className="px-4 py-2 text-right font-medium" style={{ color: sinal(h.folgaReal) }}>{brl0(h.folgaReal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="rounded-2xl border bg-white p-4 md:p-5 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Fechamento (Arsen)</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Fechar o mês depois de conferir a classificação e a cobertura de extratos. O próximo mês passa a ser o corrente e a janela avança.
          </p>
          <div className="flex flex-wrap gap-2">
            {!planoCompleto && (
              <button onClick={() => alternarFechamento(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--brand)' }}>
                <Lock size={14} /> Fechar {rotuloMes(mesCorrente, false)}
              </button>
            )}
            {entrada.fechados.length > 0 && (
              <button onClick={() => alternarFechamento(false)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                <Unlock size={14} /> Reabrir o último mês fechado
              </button>
            )}
          </div>
          {acaoErro && <p className="text-sm text-red-700">{acaoErro}</p>}
        </section>
      )}
    </div>
  )
}

function mesMeta(mes: string | null) {
  return mes ? rotuloMes(mes, false) : 'Depois de 12 meses'
}

function Kpi({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub: string; cor: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{titulo}</p>
      <p className="font-display text-xl mt-1" style={{ color: cor }}>{valor}</p>
      <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</p>
    </div>
  )
}

