import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { CreditCard, Landmark, LifeBuoy, Percent, Plus, Scale, Wallet } from 'lucide-react'
import { useAccounts, useAssets, useDebts, useTransactionsRange } from '@/hooks/useData'
import { useCatMap } from '@/hooks/useCatMap'
import { useCountUp } from '@/hooks/useCountUp'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { currentMonthKey } from '@/components/ui/MonthPicker'
import { InteractiveDonut } from '@/components/charts/InteractiveDonut'
import { CAT_SERIES } from '@/components/charts/kit'
import { brl, pct } from '@/lib/format'
import { ASSET_LABEL, DEBT_LABEL } from '@/lib/labels'
import { addMonths, lastMonths, mesesDeReserva, monthlySeries, somaPorTipo, type Tx } from '@/lib/finance'
import type { Asset, Debt } from '@/lib/supabase'

const CORES_DIVIDA = ['var(--danger)', '#E0697A', '#F59E8B', '#B45309', '#9F1239', '#64748B']

export function PatrimonioPage() {
  const { assets, total: ativos, loading: la } = useAssets()
  const { debts, total: dividas, loading: ld } = useDebts()
  const { accounts } = useAccounts()
  const fim = addMonths(currentMonthKey(), -1) // meses fechados
  const meses = useMemo(() => lastMonths(fim, 6), [fim])
  const { transactions, loading: lt } = useTransactionsRange(meses[0], fim)
  const { cats } = useCatMap()

  const liquido = ativos - dividas
  const liquidoAnimado = useCountUp(liquido)
  const reserva = assets.filter(a => a.tipo === 'reserva').reduce((s, a) => s + Number(a.valor), 0)
  const despesasMes = monthlySeries(transactions as unknown as Tx[], meses, cats).map(m => m.despesas)
  const cobertura = mesesDeReserva(reserva, despesasMes)
  const endividamento = ativos > 0 ? dividas / ativos : null
  const porTipoAtivo = somaPorTipo(assets)
  const porTipoDivida = somaPorTipo(debts)
  const loading = la || ld
  const vazio = !loading && assets.length === 0 && debts.length === 0
  const totalBarra = Math.max(ativos + dividas, 1)

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6 animate-fade-up">
      <PageHeader eyebrow="Patrimônio" title="Seu patrimônio" subtitle="Tudo o que você tem, menos o que deve"
        actions={<>
          <Link to="/ativos" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--brand)' }}><Plus className="w-4 h-4" /> Ativo</Link>
          <Link to="/dividas" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-line text-ink glass"><Plus className="w-4 h-4" /> Dívida</Link>
        </>} />

      {vazio ? (
        <Card>
          <EmptyState icon={Wallet} title="Nenhum ativo ou dívida cadastrado"
            action={<Link to="/ativos" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--brand)' }}><Plus className="w-4 h-4" /> Cadastrar ativo</Link>}>
            Cadastre reserva, investimentos, imóveis, financiamentos e empréstimos para ver o seu patrimônio líquido.
          </EmptyState>
        </Card>
      ) : (
        <>
          <section className="hero rounded-3xl p-6 md:p-7">
            <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <p className="text-xs text-white/60">Patrimônio líquido</p>
                {loading ? <div className="h-12 w-56 rounded-lg bg-white/10 animate-pulse mt-1" /> : (
                  <p className="num font-display text-4xl md:text-5xl mt-1 leading-none">{brl(liquidoAnimado)}</p>
                )}
              </div>
              <div className="w-full md:max-w-md">
                <div className="flex justify-between text-xs text-white/70 mb-1.5">
                  <span>Ativos <b className="num text-white">{brl(ativos)}</b></span>
                  <span>Dívidas <b className="num text-white">{brl(dividas)}</b></span>
                </div>
                <div className="h-3 rounded-full overflow-hidden flex bg-white/10" role="img" aria-label={`Ativos ${brl(ativos)}, dívidas ${brl(dividas)}`}>
                  <div className="transition-[width] duration-700" style={{ width: `${(ativos / totalBarra) * 100}%`, background: '#6BBD97' }} />
                  <div className="transition-[width] duration-700" style={{ width: `${(dividas / totalBarra) * 100}%`, background: '#F08A7B' }} />
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Ativos" money={ativos} icon={Wallet} color="var(--brand)" hint={`${assets.length} cadastrado${assets.length !== 1 ? 's' : ''}`} loading={loading} />
            <StatCard label="Dívidas" money={dividas} icon={CreditCard} color="var(--danger)" hint={`${debts.length} em aberto`} loading={loading} />
            <StatCard label="Endividamento" value={endividamento === null ? '—' : pct(endividamento)} icon={Percent}
              color={endividamento !== null && endividamento > 0.5 ? 'var(--danger)' : 'var(--pou)'} hint="dívidas sobre ativos" loading={loading} />
            <StatCard label="Reserva cobre" value={cobertura === null ? '—' : `${cobertura.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`}
              icon={LifeBuoy} color={cobertura !== null && cobertura < 3 ? 'var(--warning)' : 'var(--success)'}
              hint={cobertura === null ? 'sem despesas para comparar' : 'de despesas (média de 6 meses)'} loading={loading || lt} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Composição dos ativos" subtitle="Toque ou passe o mouse em cada parte"
                action={<Link to="/ativos" className="text-xs text-brand hover:underline">Gerenciar</Link>} />
              {loading ? <Skeleton className="h-48 w-full" /> : porTipoAtivo.length === 0 ? (
                <p className="text-sm text-muted py-8 text-center">Nenhum ativo cadastrado.</p>
              ) : (
                <InteractiveDonut centerLabel="Ativos" size={180}
                  items={porTipoAtivo.map((t, i) => ({ id: t.tipo, label: ASSET_LABEL[t.tipo as Asset['tipo']] ?? t.tipo, value: t.valor, color: t.tipo === 'reserva' ? 'var(--brand)' : CAT_SERIES[i % CAT_SERIES.length] }))} />
              )}
            </Card>
            <Card>
              <CardHeader title="Composição das dívidas" subtitle="Toque ou passe o mouse em cada parte"
                action={<Link to="/dividas" className="text-xs text-brand hover:underline">Gerenciar</Link>} />
              {loading ? <Skeleton className="h-48 w-full" /> : porTipoDivida.length === 0 ? (
                <p className="text-sm text-muted py-8 text-center">Sem dívidas cadastradas.</p>
              ) : (
                <InteractiveDonut centerLabel="Dívidas" size={180}
                  items={porTipoDivida.map((t, i) => ({ id: t.tipo, label: DEBT_LABEL[t.tipo as Debt['tipo']] ?? t.tipo, value: t.valor, color: CORES_DIVIDA[i % CORES_DIVIDA.length] }))} />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader title="Maiores itens" subtitle="Ativos e dívidas, do maior para o menor" />
              {loading ? <Skeleton className="h-40 w-full" /> : (
                <ul className="divide-y divide-[var(--border)]">
                  {[...assets.map(a => ({ id: a.id, nome: a.nome, tipo: ASSET_LABEL[a.tipo], valor: Number(a.valor), divida: false })),
                    ...debts.map(d => ({ id: d.id, nome: d.nome, tipo: DEBT_LABEL[d.tipo], valor: Number(d.valor), divida: true }))]
                    .sort((a, b) => b.valor - a.valor).slice(0, 8).map(i => (
                      <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: i.divida ? 'var(--danger-soft)' : 'var(--brand-soft)' }}>
                            {i.divida ? <CreditCard className="w-4 h-4 text-danger" /> : <Wallet className="w-4 h-4 text-brand" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm text-ink truncate">{i.nome}</p>
                            <p className="text-[11px] text-muted">{i.tipo}</p>
                          </div>
                        </div>
                        <p className="num text-sm font-medium shrink-0" style={{ color: i.divida ? 'var(--danger)' : 'var(--ink)' }}>
                          {i.divida ? '−' : ''}{brl(i.valor)}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Contas e cartões" action={<Link to="/contas" className="text-xs text-brand hover:underline">Gerenciar</Link>} />
              {accounts.filter(a => a.ativo).length === 0 ? (
                <p className="text-sm text-muted">Nenhuma conta cadastrada. Cadastre para separar transferências de gastos.</p>
              ) : (
                <ul className="space-y-2">
                  {accounts.filter(a => a.ativo).map(a => (
                    <li key={a.id} className="flex items-center gap-3 rounded-xl bg-surface-2/70 px-3 py-2">
                      {a.tipo === 'cartao' ? <CreditCard className="w-4 h-4 text-muted" /> : <Landmark className="w-4 h-4 text-muted" />}
                      <div className="min-w-0">
                        <p className="text-sm text-ink truncate">{a.apelido}</p>
                        <p className="text-[11px] text-muted truncate">{a.instituicao}{a.final ? ` · final ${a.final}` : ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted mt-3 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" /> Saldos de conta não entram no patrimônio: cadastre-os como ativos (ex.: reserva).</p>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
