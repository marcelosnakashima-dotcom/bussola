import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Landmark, PiggyBank, TrendingDown, TrendingUp, Upload, Wallet } from 'lucide-react'
import { InteractiveDonut } from '@/components/charts/InteractiveDonut'
import { SpendHeatmap } from '@/components/charts/SpendHeatmap'
import { HeroSaldo } from '@/components/finance/HeroSaldo'
import { CLASS_COLOR, CLASS_LABEL, CAT_SERIES } from '@/components/charts/kit'
import { useAuth } from '@/lib/auth'
import { useAccounts, useAssets, useDebts, usePlan, useTransactionsRange } from '@/hooks/useData'
import { useCatMap } from '@/hooks/useCatMap'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { MonthPicker, currentMonthKey } from '@/components/ui/MonthPicker'
import { FluxoChart } from '@/components/finance/FluxoChart'
import { TransactionList } from '@/components/finance/TransactionList'
import { RecurringCard } from '@/components/finance/RecurringCard'
import { brl, pct, variacao } from '@/lib/format'
import { byCategory, dailyTotals, isDespesa, lastMonths, monthKey, monthLabel, monthlySeries, resumo503020, type Tx } from '@/lib/finance'

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mes, setMes] = useState(currentMonthKey())
  const meses = useMemo(() => lastMonths(mes, 12), [mes])

  const { transactions, loading, error } = useTransactionsRange(meses[0], mes)
  const { cats } = useCatMap()
  const { plan } = usePlan()
  const { total: totalAtivos, loading: loadingAtivos } = useAssets()
  const { total: totalDividas, loading: loadingDividas } = useDebts()
  const { accounts } = useAccounts()
  const [conta, setConta] = useState('')

  const txs = transactions as unknown as Tx[]
  const serie = useMemo(() => monthlySeries(txs, meses, cats), [txs, meses, cats])
  const atual = serie[serie.length - 1]
  const anterior = serie[serie.length - 2]
  const doMes = useMemo(() => txs.filter(t => monthKey(t.data) === mes), [txs, mes])
  const categorias = useMemo(() => byCategory(doMes, cats), [doMes, cats])
  const r503020 = resumo503020(atual, plan)
  const ultimos = conta ? doMes.filter(t => t.account_id === conta) : doMes
  const accountName = (id?: string | null) => accounts.find(a => a.id === id)?.apelido ?? null

  const nome = ((user?.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0]
  const spark = (k: 'receitas' | 'despesas' | 'saldo') => serie.slice(-6).map(s => s[k])
  const sparkLabels = serie.slice(-6).map(s => monthLabel(s.mes, 'short'))
  const hojeIso = new Date().toISOString().slice(0, 10)
  const dias = useMemo(() => dailyTotals(doMes, mes, isDespesa), [doMes, mes])
  const liquido = totalAtivos - totalDividas
  const semDados = !loading && txs.length === 0

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6 animate-fade-up">
      <PageHeader eyebrow="Visão geral" title={nome ? `Olá, ${nome}` : 'Olá'}
        subtitle={`Resumo de ${monthLabel(mes).toLowerCase()}`}
        actions={<MonthPicker value={mes} onChange={setMes} />} />

      {error && (
        <p role="alert" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          Não foi possível carregar seus lançamentos. Recarregue a página.
        </p>
      )}

      {!semDados && !loading && <HeroSaldo serie={serie} mes={mes} patrimonio={liquido} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Receitas" money={atual?.receitas ?? 0} icon={TrendingUp} color="var(--success)"
          delta={variacao(atual?.receitas ?? 0, anterior?.receitas ?? 0)} goodWhen="up" hint="vs mês anterior"
          spark={spark('receitas')} sparkLabels={sparkLabels} loading={loading} />
        <StatCard label="Despesas" money={atual?.despesas ?? 0} icon={TrendingDown} color="var(--danger)"
          delta={variacao(atual?.despesas ?? 0, anterior?.despesas ?? 0)} goodWhen="down" hint="vs mês anterior"
          spark={spark('despesas')} sparkLabels={sparkLabels} loading={loading} />
        <StatCard label="Sobrou no mês" money={atual?.saldo ?? 0} icon={PiggyBank} color="var(--brand)"
          hint={r503020.renda ? `${pct((atual?.saldo ?? 0) / r503020.renda)} da renda` : undefined}
          spark={spark('saldo')} sparkLabels={sparkLabels} loading={loading} />
        <StatCard label="Patrimônio líquido" money={liquido} icon={Wallet} color="var(--pou)"
          hint={`ativos ${brl(totalAtivos)} · dívidas ${brl(totalDividas)}`} loading={loadingAtivos || loadingDividas} />
      </div>

      {semDados ? (
        <Card>
          <EmptyState icon={Upload} title="Ainda não há lançamentos nos últimos 12 meses"
            action={<Link to="/importar" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--brand)' }}>
              <Upload className="w-4 h-4" /> Importar extrato ou fatura</Link>}>
            Importe um extrato ou uma fatura para ver gráficos, categorias e a sua regra 50/30/20.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Fluxo dos últimos 12 meses" subtitle="Clique em um mês para ver o resumo dele" />
            {loading ? <Skeleton className="h-[280px] w-full" /> : <FluxoChart data={serie} selected={mes} onSelect={setMes} />}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Regra 50/30/20" subtitle={r503020.renda ? `Renda considerada: ${brl(r503020.renda)} · clique para ver as despesas` : undefined}
                action={<Link to="/metas" className="text-xs text-brand hover:underline">Ajustar metas</Link>} />
              {loading ? <Skeleton className="h-48 w-full" /> : (
                <>
                  <InteractiveDonut centerLabel="Despesas do mês" size={180}
                    items={r503020.classes.map(c => ({ id: c.classificacao, label: CLASS_LABEL[c.classificacao], value: c.total, color: CLASS_COLOR[c.classificacao] }))}
                    onSelect={id => navigate({ to: '/despesas', search: { mes, classe: id as 'necessidade' | 'desejo' | 'poupanca' } })} />
                  {r503020.renda > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      {r503020.classes.map(c => {
                        const alvo = c.meta / r503020.renda
                        const ruim = c.classificacao === 'poupanca' ? c.total < c.meta : c.total > c.meta
                        return (
                          <div key={c.classificacao} className="rounded-xl bg-surface-2/70 px-3 py-2">
                            <p className="text-[10px] text-muted truncate">{CLASS_LABEL[c.classificacao]}</p>
                            <p className="num text-sm font-semibold" style={{ color: ruim ? 'var(--danger)' : 'var(--ink)' }}>{pct(c.pct)}</p>
                            <p className="text-[10px] text-muted">meta {pct(alvo)}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </Card>
            <Card>
              <CardHeader title="Onde você mais gastou" subtitle="Toque ou passe o mouse; clique para abrir"
                action={<Link to="/despesas" search={{ mes }} className="text-xs text-brand hover:underline inline-flex items-center gap-1">Todas <ArrowRight className="w-3 h-3" /></Link>} />
              {loading ? <Skeleton className="h-48 w-full" /> : (
                <InteractiveDonut centerLabel="Despesas do mês" size={180}
                  items={categorias.slice(0, 6).map((c, i) => ({ id: c.id, label: c.nome, value: c.valor, color: c.classificacao ? CAT_SERIES[i % CAT_SERIES.length] : 'var(--muted)' }))}
                  onSelect={id => navigate({ to: '/despesas', search: { mes, categoria: id } })} />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-3">
              <CardHeader title="Gastos dia a dia" subtitle="Clique em um dia para ver os lançamentos dele" />
              {loading ? <Skeleton className="h-64 w-full" /> : (
                <SpendHeatmap dias={dias} mes={mes} hoje={hojeIso}
                  onSelect={d => d && navigate({ to: '/despesas', search: { mes, dia: d } })} />
              )}
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Patrimônio" />
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted flex items-center gap-2"><Wallet className="w-4 h-4" /> Ativos</dt><dd className="num font-medium text-ink">{brl(totalAtivos)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted flex items-center gap-2"><Landmark className="w-4 h-4" /> Dívidas</dt><dd className="num font-medium" style={{ color: 'var(--danger)' }}>{brl(totalDividas)}</dd></div>
                <div className="flex justify-between border-t border-line pt-2"><dt className="font-medium text-ink">Líquido</dt><dd className="num font-semibold text-ink">{brl(liquido)}</dd></div>
              </dl>
              {(totalAtivos > 0 || totalDividas > 0) && (
                <div className="mt-4 h-3 rounded-full overflow-hidden flex bg-surface-2" aria-hidden="true">
                  <div style={{ width: `${(totalAtivos / Math.max(totalAtivos + totalDividas, 1)) * 100}%`, background: 'var(--brand)' }} />
                  <div style={{ width: `${(totalDividas / Math.max(totalAtivos + totalDividas, 1)) * 100}%`, background: 'var(--danger)' }} />
                </div>
              )}
              <div className="flex gap-4 mt-3 text-xs">
                <Link to="/ativos" className="text-brand hover:underline">Ativos</Link>
                <Link to="/dividas" className="text-brand hover:underline">Dívidas</Link>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-3">
              <CardHeader title="Últimos lançamentos"
                action={accounts.length > 0 && (
                  <select value={conta} onChange={e => setConta(e.target.value)} aria-label="Filtrar por conta"
                    className="border border-line rounded-lg px-2 py-1 text-xs bg-surface text-ink max-w-[160px]">
                    <option value="">Todas as contas</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.apelido}{a.ativo ? '' : ' (desativada)'}</option>)}
                  </select>
                )} />
              {loading ? <Skeleton className="h-48 w-full" /> : <TransactionList txs={ultimos} cats={cats} accountName={accountName} limit={8} />}
              <div className="flex gap-4 mt-3 text-xs">
                <Link to="/despesas" search={{ mes }} className="text-brand hover:underline">Ver despesas</Link>
                <Link to="/receitas" search={{ mes }} className="text-brand hover:underline">Ver receitas</Link>
              </div>
            </Card>
            <div className="lg:col-span-2 space-y-4">
              <RecurringCard />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
