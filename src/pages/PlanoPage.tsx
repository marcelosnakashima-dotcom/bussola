import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { CalendarCheck, AlertTriangle, Lock, Unlock } from 'lucide-react'
import { usePlano, usePlanoHouseholds, type Cobertura } from '@/hooks/usePlano'
import { useUserRole } from '@/hooks/useData'
import {
  BASES_RENDA, compararCenarios, historicoFechado, projetar, rotuloMes,
  type BaseRenda, type PlanoEntrada,
} from '@/lib/planoForecast'
import type { ConteudoPlano, Pendencia } from '@/lib/planoConteudo'
import {
  Secao, SecaoAcompanhamento, SecaoCaixa, SecaoCorte, SecaoDiagnostico, SecaoDividas, SecaoMetodo, brl0, bordaCartao, cartao,
} from '@/components/plano/PlanoSecoes'
import { SecaoPendencias } from '@/components/plano/PendenciasPlano'

const COR = { necessidade: '#2A6049', divida: '#17221B', desejo: '#D97706', futuro: '#2563EB', receita: '#8B5CF6' }
const sinal = (n: number) => (n >= 0 ? 'var(--brand)' : '#B91C1C')
const VAZIO: ConteudoPlano = { diagnostico: null, metodo: null, caixa: null, corte: null, dividas: null }

export function PlanoPage() {
  const { isAdmin } = useUserRole()
  const [alvo, setAlvo] = useState<string | null>(null)
  const households = usePlanoHouseholds(isAdmin)
  const { dados, semPlano, loading, error, fecharMes, responder } = usePlano(isAdmin ? alvo : null)

  // Seletor "Ver como", só para admin: troca o household exibido sem trocar de login.
  const seletor = isAdmin && households.length > 0 && (
    <div className="p-4 md:px-8 md:pt-6 max-w-screen-lg mx-auto">
      <label className="text-xs" style={{ color: 'var(--muted)' }}>
        Ver como (admin)
        <select value={alvo ?? ''} onChange={e => setAlvo(e.target.value || null)}
          className="block mt-1 rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
          <option value="">Meu household</option>
          {households.map(h => <option key={h.id} value={h.id}>{h.rotulo}</option>)}
        </select>
      </label>
    </div>
  )

  if (loading) return <>{seletor}<div className="p-8 text-sm" style={{ color: 'var(--muted)' }}>Carregando o plano…</div></>

  if (error) return <>{seletor}<div className="p-8 text-sm text-red-700">Não foi possível carregar o plano: {error}</div></>
  if (semPlano || !dados) {
    return (
      <>{seletor}<div className="p-4 md:p-8 max-w-screen-md mx-auto">
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>Meu plano financeiro</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          O plano financeiro ainda não foi publicado para este grupo familiar. Quando a Arsen concluir a
          construção do plano, ele aparece aqui e se atualiza a cada extrato importado.
        </p>
      </div></>
    )
  }
  const verComo = isAdmin && alvo !== null
  return (
    <>
      {seletor}
      <PlanoView
        entrada={dados.entrada} cobertura={dados.cobertura} coberturaMes={dados.coberturaMes} isAdmin={isAdmin}
        onFechar={fecharMes} conteudo={dados.conteudo} pendencias={dados.pendencias}
        realizadoVisivel={verComo ? true : dados.realizadoVisivel}
        onResponder={responder} somenteLeitura={verComo}
      />
    </>
  )
}

export interface PlanoViewProps {
  entrada: PlanoEntrada
  cobertura: Cobertura | null
  coberturaMes: string | null
  isAdmin: boolean
  onFechar: (mes: string, fechar: boolean) => Promise<void>
  conteudo?: ConteudoPlano
  pendencias?: Pendencia[]
  realizadoVisivel?: boolean
  onResponder?: (id: string, resposta: string) => Promise<void>
  somenteLeitura?: boolean
}

export function PlanoView({
  entrada, cobertura, coberturaMes, isAdmin, onFechar,
  conteudo = VAZIO, pendencias = [], realizadoVisivel = false, onResponder = async () => {}, somenteLeitura = false,
}: PlanoViewProps) {
  const [acaoErro, setAcaoErro] = useState<string | null>(null)

  const calc = useMemo(() => {
    const proj = projetar(entrada, 'plano', 'tipica')
    return {
      proj,
      // O mesmo plano com duas rendas: a típica e o holerite mais recente (os demais cenários ficam no motor).
      rendas: (['tipica', 'holerite'] as BaseRenda[]).map(base => {
        const p = projetar(entrada, 'plano', base)
        const r = compararCenarios(entrada, base).find(c => c.cenario === 'plano')
        return {
          base,
          // menor receita da janela = renda do mês sem 13º e férias
          rendaBase: p.janela.length ? Math.min(...p.janela.map(m => m.receita)) : 0,
          folgaMedia: r?.folgaMedia ?? 0, reservaFinal: r?.reservaFinal ?? 0, mesDaMeta: r?.mesDaMeta ?? null,
        }
      }),
      historico: historicoFechado(entrada),
    }
  }, [entrada])

  const { proj, rendas, historico } = calc
  const { janela, mesCorrente, planoCompleto } = proj
  const primeiro = janela[0]
  const ultimo = janela[janela.length - 1]
  const faltamExtratos = realizadoVisivel && cobertura != null && cobertura.contasAtivas > 0 && cobertura.contasComLote < cobertura.contasAtivas
  const dadosGrafico = janela.map(m => ({
    mes: rotuloMes(m.mes),
    Necessidades: Math.round(m.necessidade),
    Dívidas: Math.round(m.divida),
    Desejos: Math.round(m.desejo),
    Futuro: Math.round(m.futuro),
    Receitas: Math.round(m.receita),
  }))
  const mesDaMetaPlano = janela.find(m => m.metaReserva > 0 && m.reservaFim >= m.metaReserva)?.mes ?? null
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

  const abertas = pendencias.filter(p => p.status !== 'resolvida' && p.responsavel === 'casal').length
  const nav = [
    conteudo.diagnostico && { id: 'onde-estamos', label: 'Onde estamos' },
    conteudo.metodo && { id: 'metodo', label: 'Método' },
    conteudo.caixa && { id: 'caixa', label: 'Caixa' },
    conteudo.corte && { id: 'corte', label: 'Plano de corte' },
    conteudo.dividas && { id: 'dividas', label: 'Dívidas' },
    janela.length > 0 && { id: 'projecao', label: 'Mês a mês' },
    pendencias.length > 0 && { id: 'pendencias', label: abertas ? `Pendências (${abertas})` : 'Pendências' },
    { id: 'acompanhamento', label: 'Acompanhamento' },
  ].filter(Boolean) as { id: string; label: string }[]
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="p-4 md:p-8 max-w-screen-lg mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>Meu plano financeiro</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
          O plano combinado com a Arsen, os próximos 12 meses e o que falta decidir.
        </p>
      </div>

      <nav aria-label="Seções do plano" className="sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 py-2 overflow-x-auto flex gap-2 backdrop-blur" style={{ background: 'rgba(245,240,232,.92)' }}>
        {nav.map(n => (
          <button key={n.id} onClick={() => ir(n.id)} className="whitespace-nowrap rounded-full border bg-white px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            {n.label}
          </button>
        ))}
      </nav>

      {conteudo.diagnostico && <SecaoDiagnostico d={conteudo.diagnostico} />}
      {conteudo.metodo && <SecaoMetodo m={conteudo.metodo} />}
      {conteudo.caixa && <SecaoCaixa c={conteudo.caixa} />}
      {conteudo.corte && <SecaoCorte c={conteudo.corte} />}
      {conteudo.dividas && <SecaoDividas d={conteudo.dividas} inicio={entrada.config.inicio} />}

      {/* Projeção de 12 meses */}
      <Secao id="projecao" kicker="MÊS A MÊS" titulo="Quanto entra, quanto sai e quanto sobra"
        subtitulo={janela.length ? `Os próximos 12 meses, a partir de ${rotuloMes(mesCorrente, false)}, seguindo o plano combinado com a renda típica do casal.` : undefined}>
        {planoCompleto && (
          <div className={cartao} style={bordaCartao}>
            <p className="text-sm">Todos os meses do plano foram fechados. Combine com a Arsen o próximo ciclo de planejamento.</p>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi titulo="Folga do mês" valor={brl0(primeiro.folga)} cor={sinal(primeiro.folga)} sub={`Receitas ${brl0(primeiro.receita)} · despesas ${brl0(primeiro.despesas)}`} />
              <Kpi titulo="Folga média (12 meses)" valor={brl0(janela.reduce((s, m) => s + m.folga, 0) / janela.length)} cor={sinal(janela.reduce((s, m) => s + m.folga, 0))} sub="Receitas menos despesas" />
              <Kpi titulo="Reserva ao fim da janela" valor={brl0(ultimo.reservaFim)} cor="var(--ink)" sub={`Meta ${brl0(ultimo.metaReserva)} (${Math.round(pctMeta * 100)}%)`} />
              <Kpi titulo="Reserva alcança a meta" valor={mesMeta(mesDaMetaPlano)} cor="var(--ink)" sub={`${entrada.config.metaReservaMeses} meses de necessidades`} />
            </div>

            <div className={cartao} style={bordaCartao}>
              <h3 className="font-display text-lg mb-3" style={{ color: 'var(--ink)' }}>Receitas e despesas por mês</h3>
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
            </div>

            <div className={`${cartao} !p-0 overflow-hidden`} style={bordaCartao}>
              <h3 className="font-display text-lg p-4 md:p-5 pb-2" style={{ color: 'var(--ink)' }}>Mês a mês</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
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
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <h3 className="font-display text-xl" style={{ color: 'var(--ink)' }}>Renda típica ou holerite?</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                  O mesmo plano com duas rendas. Cada cartão mostra, em média, quanto sobra por mês, quanto de reserva se forma em 12 meses e quando ela chega na meta.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rendas.map(r => {
                  const tipica = r.base === 'tipica'
                  return (
                    <div key={r.base} className={cartao} style={{ ...bordaCartao, ...(tipica ? { borderColor: 'var(--brand)', borderWidth: 2 } : null) }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                          {tipica ? 'Plano com a renda típica' : 'Plano com o holerite mais recente'}
                        </p>
                        {tipica && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#CFEBDA', color: 'var(--ink)' }}>Usada no mês a mês</span>}
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                        {tipica
                          ? 'Média do que a família costuma receber, sem pagamentos pontuais.'
                          : 'O contracheque mais recente. É um mês só e pode vir acima ou abaixo da média.'}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        <div><dt className="text-[11px]" style={{ color: 'var(--muted)' }}>Renda por mês</dt><dd className="font-semibold" style={{ color: 'var(--ink)' }}>{brl0(r.rendaBase)}</dd></div>
                        <div><dt className="text-[11px]" style={{ color: 'var(--muted)' }}>Sobra por mês</dt><dd className="font-semibold" style={{ color: sinal(r.folgaMedia) }}>{brl0(r.folgaMedia)}</dd></div>
                        <div><dt className="text-[11px]" style={{ color: 'var(--muted)' }}>Reserva em 12 meses</dt><dd className="font-semibold" style={{ color: 'var(--ink)' }}>{brl0(r.reservaFinal)}</dd></div>
                        <div><dt className="text-[11px]" style={{ color: 'var(--muted)' }}>Chega na meta</dt><dd className="font-semibold" style={{ color: 'var(--ink)' }}>{mesMeta(r.mesDaMeta)}</dd></div>
                      </dl>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                O 13º e as férias entram nas duas rendas do mesmo jeito. A meta da reserva é de {entrada.config.metaReservaMeses} meses de necessidades.
              </p>
            </div>
          </>
        )}

        {realizadoVisivel && historico.length > 0 && (
          <div className={`${cartao} !p-0 overflow-hidden`} style={bordaCartao}>
            <h3 className="font-display text-lg p-4 md:p-5 pb-2 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <CalendarCheck size={18} /> Meses fechados: realizado contra o plano
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
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
          </div>
        )}
      </Secao>

      {pendencias.length > 0 && <SecaoPendencias pendencias={pendencias} onResponder={onResponder} podeResponder={!somenteLeitura} />}

      <SecaoAcompanhamento />

      {isAdmin && (
        <section className={`${cartao} space-y-3`} style={bordaCartao}>
          <h2 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Fechamento (Arsen)</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Fechar o mês depois de conferir a classificação e a cobertura de extratos. O próximo mês passa a ser o corrente e a janela avança.
            {!realizadoVisivel && ' O realizado está oculto para o casal (plano_config.realizado_visivel = false).'}
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
    <div className={cartao} style={bordaCartao}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{titulo}</p>
      <p className="font-display text-xl mt-1" style={{ color: cor }}>{valor}</p>
      <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</p>
    </div>
  )
}
