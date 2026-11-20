import { useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Hash, Layers, Receipt, Search, TrendingDown, X } from 'lucide-react'
import { useAccounts, useTransactionsRange } from '@/hooks/useData'
import { useCatMap } from '@/hooks/useCatMap'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { MonthPicker, currentMonthKey } from '@/components/ui/MonthPicker'
import { CategoryBars } from '@/components/finance/CategoryBars'
import { CategoryTreemap } from '@/components/charts/CategoryTreemap'
import { InteractiveDonut } from '@/components/charts/InteractiveDonut'
import { SpendHeatmap } from '@/components/charts/SpendHeatmap'
import { ClassesChart } from '@/components/finance/ClassesChart'
import { CumulativeChart } from '@/components/finance/CumulativeChart'
import { TransactionList } from '@/components/finance/TransactionList'
import { CLASS_COLOR, CLASS_LABEL, CAT_SERIES } from '@/components/charts/kit'
import { brl, variacao } from '@/lib/format'
import {
  PERIODO_MESES, addMonths, byCategory, dailyCumulative, dailyTotals, filterDespesas, isDespesa, monthLabel, monthlySeries,
  periodMonths, total, type Classe, type Periodo, type Tx,
} from '@/lib/finance'
import { validateMovSearch, type MovSearch } from './search'

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'mes', label: 'Mês' }, { value: '3m', label: '3 meses' }, { value: '6m', label: '6 meses' }, { value: '12m', label: '12 meses' },
]
const PAGINA = 60

export function DespesasPage() {
  const search = validateMovSearch(useSearch({ strict: false }) as Record<string, unknown>)
  const navigate = useNavigate()
  const set = (patch: Partial<MovSearch>) =>
    navigate({ to: '/despesas', search: (prev: Record<string, unknown>) => ({ ...validateMovSearch(prev), ...patch }), replace: true })

  const mes = search.mes ?? currentMonthKey()
  const periodo = search.periodo ?? 'mes'
  const meses = useMemo(() => periodMonths(periodo, mes), [periodo, mes])
  const mesesAnt = useMemo(() => periodMonths(periodo, addMonths(mes, -PERIODO_MESES[periodo])), [periodo, mes])

  const { transactions, loading, error } = useTransactionsRange(mesesAnt[0], mes)
  const { cats } = useCatMap()
  const { accounts } = useAccounts()
  const accountName = (id?: string | null) => accounts.find(a => a.id === id)?.apelido ?? null
  const txs = transactions as unknown as Tx[]

  const filtroBase = { classe: search.classe, conta: search.conta, busca: search.q }
  const filtradas = useMemo(() => filterDespesas(txs, { months: meses, ...filtroBase, categoria: search.categoria }, cats),
    [txs, meses, search.classe, search.conta, search.q, search.categoria, cats])
  const anteriores = useMemo(() => filterDespesas(txs, { months: mesesAnt, ...filtroBase, categoria: search.categoria }, cats),
    [txs, mesesAnt, search.classe, search.conta, search.q, search.categoria, cats])
  // categorias: todos os filtros menos a própria categoria, para poder trocar de categoria
  const paraCategorias = useMemo(() => filterDespesas(txs, { months: meses, ...filtroBase }, cats),
    [txs, meses, search.classe, search.conta, search.q, cats])
  const categorias = useMemo(() => byCategory(paraCategorias, cats), [paraCategorias, cats])

  const daDia = search.dia && periodo === 'mes' ? filtradas.filter(t => t.data === search.dia) : filtradas
  const dias = useMemo(() => dailyTotals(filtradas, mes, isDespesa), [filtradas, mes])
  const [visao, setVisao] = useState<'blocos' | 'rosca' | 'lista'>('blocos')
  const corCat = (i: number, cl: string | null) => (cl ? CAT_SERIES[i % CAT_SERIES.length] : 'var(--muted)')
  const totalAtual = total(filtradas)
  const totalAnt = total(anteriores)
  const hojeKey = currentMonthKey()
  const diasDecorridos = mes === hojeKey ? new Date().getDate() : Number(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate())
  const media = periodo === 'mes' ? totalAtual / Math.max(diasDecorridos, 1) : totalAtual / meses.length
  const maior = byCategory(filtradas, cats)[0]

  const [busca, setBusca] = useState(search.q ?? '')
  const [mostrar, setMostrar] = useState(PAGINA)
  const temFiltro = !!(search.classe || search.categoria || search.conta || search.q || search.dia)

  const mesAnt = addMonths(mes, -1)
  const serie = useMemo(() => monthlySeries(filtradas, meses, cats), [filtradas, meses, cats])

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6 animate-fade-up">
      <PageHeader eyebrow="Movimentação" title="Despesas"
        subtitle={periodo === 'mes' ? monthLabel(mes) : `${monthLabel(meses[0], 'short')} a ${monthLabel(mes, 'short')}`}
        actions={<>
          <Segmented label="Período" value={periodo} onChange={v => set({ periodo: v, dia: undefined })} options={PERIODOS} />
          <MonthPicker value={mes} onChange={m => set({ mes: m, dia: undefined })} />
        </>} />

      {error && <p role="alert" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Não foi possível carregar as despesas. Recarregue a página.</p>}

      {/* Filtros */}
      <Card className="!p-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grupo">
            {([undefined, 'necessidade', 'desejo', 'poupanca'] as (Classe | undefined)[]).map(c => {
              const ativo = search.classe === c
              return (
                <button key={c ?? 'todas'} type="button" aria-pressed={ativo} onClick={() => set({ classe: c, categoria: undefined })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={ativo ? { background: c ? CLASS_COLOR[c] : 'var(--ink)', borderColor: 'transparent', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  {c && !ativo && <span className="w-2 h-2 rounded-full" style={{ background: CLASS_COLOR[c] }} />}
                  {c ? CLASS_LABEL[c] : 'Todas'}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 flex-1 lg:justify-end flex-wrap">
            {accounts.length > 0 && (
              <select value={search.conta ?? ''} onChange={e => set({ conta: e.target.value || undefined })} aria-label="Conta"
                className="border border-line rounded-xl px-3 py-2 text-sm bg-surface text-ink">
                <option value="">Todas as contas</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.apelido}</option>)}
              </select>
            )}
            <form className="relative flex-1 min-w-[180px] lg:max-w-xs" onSubmit={e => { e.preventDefault(); set({ q: busca.trim() || undefined }) }}>
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={busca} onChange={e => setBusca(e.target.value)} onBlur={() => set({ q: busca.trim() || undefined })}
                placeholder="Buscar descrição" aria-label="Buscar descrição"
                className="w-full border border-line rounded-xl pl-9 pr-3 py-2 text-sm bg-surface text-ink" />
            </form>
            {temFiltro && (
              <button type="button" onClick={() => { setBusca(''); set({ classe: undefined, categoria: undefined, conta: undefined, q: undefined, dia: undefined }) }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-muted hover:text-ink">
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={periodo === 'mes' ? 'Total no mês' : 'Total no período'} money={totalAtual} icon={TrendingDown} color="var(--danger)"
          delta={variacao(totalAtual, totalAnt)} goodWhen="down" hint={periodo === 'mes' ? 'vs mês anterior' : 'vs período anterior'} loading={loading} />
        <StatCard label={periodo === 'mes' ? 'Média por dia' : 'Média por mês'} money={media} icon={Layers} color="var(--ink)" loading={loading} />
        <StatCard label="Maior categoria" value={maior ? maior.nome : '—'} icon={Receipt} color="var(--des)"
          hint={maior ? brl(maior.valor) : undefined} loading={loading} />
        <StatCard label="Lançamentos" value={String(filtradas.length)} icon={Hash} color="var(--pou)" loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          {periodo === 'mes' ? (
            <>
              <CardHeader title="Ritmo do mês" subtitle={<span>Acumulado por dia: {monthLabel(mes, 'short')} contra {monthLabel(mesAnt, 'short')} (tracejado)</span>} />
              {loading ? <Skeleton className="h-[260px] w-full" /> : (
                <CumulativeChart
                  atual={dailyCumulative(filtradas, mes, isDespesa, mes === hojeKey ? new Date().getDate() : undefined)}
                  anterior={dailyCumulative(filterDespesas(txs, { months: [mesAnt], ...filtroBase, categoria: search.categoria }, cats), mesAnt, isDespesa)}
                  labelAtual={monthLabel(mes, 'short')} labelAnterior={monthLabel(mesAnt, 'short')}
                  ateDia={mes === hojeKey ? new Date().getDate() : undefined} />
              )}
            </>
          ) : (
            <>
              <CardHeader title="Despesas por mês" subtitle="Por grupo do 50/30/20. Clique em um mês para abri-lo" />
              {loading ? <Skeleton className="h-[260px] w-full" /> : <ClassesChart data={serie} onSelect={m => set({ mes: m, periodo: 'mes' })} />}
            </>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Por categoria" subtitle={search.categoria ? 'Clique de novo para tirar o filtro' : 'Clique para filtrar'}
            action={<Segmented label="Visualização" value={visao} onChange={setVisao}
              options={[{ value: 'blocos', label: 'Blocos' }, { value: 'rosca', label: 'Rosca' }, { value: 'lista', label: 'Lista' }]} />} />
          {loading ? <Skeleton className="h-[280px] w-full" /> : visao === 'blocos' ? (
            <CategoryTreemap selected={search.categoria} onSelect={id => set({ categoria: id ?? undefined })}
              items={categorias.map((c, i) => ({ id: c.id, name: c.nome, value: c.valor, pct: c.pct, color: corCat(i, c.classificacao) }))} />
          ) : visao === 'rosca' ? (
            <InteractiveDonut centerLabel="Despesas no período" size={170} selected={search.categoria}
              onSelect={id => set({ categoria: search.categoria === id ? undefined : id })}
              items={categorias.slice(0, 8).map((c, i) => ({ id: c.id, label: c.nome, value: c.valor, color: corCat(i, c.classificacao) }))} />
          ) : (
            <div className="max-h-[320px] overflow-y-auto pr-1">
              <CategoryBars data={categorias} selected={search.categoria} onSelect={id => set({ categoria: id ?? undefined })} />
            </div>
          )}
        </Card>
      </div>

      {periodo === 'mes' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader title="Gastos dia a dia" subtitle={search.dia ? 'Mostrando só o dia escolhido' : 'Clique em um dia para filtrar'} />
            {loading ? <Skeleton className="h-64 w-full" /> : (
              <SpendHeatmap dias={dias} mes={mes} selected={search.dia} onSelect={d => set({ dia: d ?? undefined })}
                hoje={mes === hojeKey ? new Date().toISOString().slice(0, 10) : undefined} />
            )}
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader title={search.dia ? 'Lançamentos do dia' : 'Lançamentos'} subtitle={`${daDia.length} despesa${daDia.length !== 1 ? 's' : ''} · ${brl(total(daDia))}`} />
            {loading ? <Skeleton className="h-64 w-full" /> : (
              <div className="max-h-[440px] overflow-y-auto pr-1">
                <TransactionList txs={daDia.slice(0, mostrar)} cats={cats} accountName={accountName} />
                {daDia.length > mostrar && (
                  <button type="button" onClick={() => setMostrar(m => m + PAGINA)}
                    className="mt-4 w-full py-2.5 rounded-xl border border-line text-sm text-ink hover:bg-surface-2">
                    Mostrar mais ({daDia.length - mostrar} restantes)
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {periodo !== 'mes' && (
      <Card>
        <CardHeader title="Lançamentos" subtitle={`${filtradas.length} despesa${filtradas.length !== 1 ? 's' : ''} · ${brl(totalAtual)}`} />
        {loading ? <Skeleton className="h-64 w-full" /> : (
          <>
            <TransactionList txs={filtradas.slice(0, mostrar)} cats={cats} accountName={accountName} />
            {filtradas.length > mostrar && (
              <button type="button" onClick={() => setMostrar(m => m + PAGINA)}
                className="mt-4 w-full py-2.5 rounded-xl border border-line text-sm text-ink hover:bg-surface-2">
                Mostrar mais ({filtradas.length - mostrar} restantes)
              </button>
            )}
          </>
        )}
      </Card>
      )}
    </div>
  )
}
