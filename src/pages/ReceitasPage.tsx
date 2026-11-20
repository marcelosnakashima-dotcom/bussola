import { useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarRange, Hash, Search, TrendingUp, Trophy, X } from 'lucide-react'
import { useAccounts, useTransactionsRange } from '@/hooks/useData'
import { useCatMap } from '@/hooks/useCatMap'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { MonthPicker, currentMonthKey } from '@/components/ui/MonthPicker'
import { InteractiveDonut } from '@/components/charts/InteractiveDonut'
import { TransactionList } from '@/components/finance/TransactionList'
import { ChartTooltip, CAT_SERIES, axisProps, gridProps } from '@/components/charts/kit'
import { axisCompact, brl, variacao } from '@/lib/format'
import {
  PERIODO_MESES, addMonths, fonteKey, inMonths, incomeSources, isReceita, lastMonths, monthLabel, monthlySeries,
  normalize, periodMonths, total, type Periodo, type Tx,
} from '@/lib/finance'
import { validateMovSearch, type MovSearch } from './search'

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'mes', label: 'Mês' }, { value: '3m', label: '3 meses' }, { value: '6m', label: '6 meses' }, { value: '12m', label: '12 meses' },
]
const PAGINA = 60

export function ReceitasPage() {
  const search = validateMovSearch(useSearch({ strict: false }) as Record<string, unknown>)
  const navigate = useNavigate()
  const set = (patch: Partial<MovSearch>) =>
    navigate({ to: '/receitas', search: (prev: Record<string, unknown>) => ({ ...validateMovSearch(prev), ...patch }), replace: true })

  const mes = search.mes ?? currentMonthKey()
  const periodo = search.periodo ?? 'mes'
  const meses = useMemo(() => periodMonths(periodo, mes), [periodo, mes])
  const mesesAnt = useMemo(() => periodMonths(periodo, addMonths(mes, -PERIODO_MESES[periodo])), [periodo, mes])
  const meses12 = useMemo(() => lastMonths(mes, 12), [mes])
  const inicio = mesesAnt[0] < meses12[0] ? mesesAnt[0] : meses12[0]

  const { transactions, loading, error } = useTransactionsRange(inicio, mes)
  const { cats } = useCatMap()
  const { accounts } = useAccounts()
  const accountName = (id?: string | null) => accounts.find(a => a.id === id)?.apelido ?? null
  const txs = transactions as unknown as Tx[]

  // fonte selecionada usa o parâmetro "categoria" da URL (receita não tem categoria)
  const fonte = search.categoria
  const q = search.q ? normalize(search.q) : ''
  const passa = (t: Tx, months: string[], comFonte = true) =>
    isReceita(t) && inMonths(t, months) && (!search.conta || t.account_id === search.conta) &&
    (!q || normalize(t.descricao).includes(q)) && (!comFonte || !fonte || fonteKey(t.descricao) === fonte)

  const filtradas = useMemo(() => txs.filter(t => passa(t, meses)), [txs, meses, search.conta, q, fonte])
  const anteriores = useMemo(() => txs.filter(t => passa(t, mesesAnt)), [txs, mesesAnt, search.conta, q, fonte])
  const fontes = useMemo(() => incomeSources(txs.filter(t => passa(t, meses, false)), 8), [txs, meses, search.conta, q])
  const serie12 = useMemo(() => monthlySeries(txs.filter(t => passa(t, meses12)), meses12, cats), [txs, meses12, search.conta, q, fonte, cats])

  const totalAtual = total(filtradas)
  const totalAnt = total(anteriores)
  const comReceita = serie12.filter(s => s.receitas > 0)
  const media12 = comReceita.length ? comReceita.reduce((s, x) => s + x.receitas, 0) / comReceita.length : 0
  const maior = fontes.find(f => f.chave !== '__outras__')

  const [busca, setBusca] = useState(search.q ?? '')
  const [mostrar, setMostrar] = useState(PAGINA)
  const temFiltro = !!(fonte || search.conta || search.q)

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6 animate-fade-up">
      <PageHeader eyebrow="Movimentação" title="Receitas"
        subtitle={periodo === 'mes' ? monthLabel(mes) : `${monthLabel(meses[0], 'short')} a ${monthLabel(mes, 'short')}`}
        actions={<>
          <Segmented label="Período" value={periodo} onChange={v => set({ periodo: v })} options={PERIODOS} />
          <MonthPicker value={mes} onChange={m => set({ mes: m })} />
        </>} />

      {error && <p role="alert" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Não foi possível carregar as receitas. Recarregue a página.</p>}

      <Card className="!p-3">
        <div className="flex gap-2 flex-wrap">
          {accounts.length > 0 && (
            <select value={search.conta ?? ''} onChange={e => set({ conta: e.target.value || undefined })} aria-label="Conta"
              className="border border-line rounded-xl px-3 py-2 text-sm bg-surface text-ink">
              <option value="">Todas as contas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.apelido}</option>)}
            </select>
          )}
          <form className="relative flex-1 min-w-[180px] max-w-sm" onSubmit={e => { e.preventDefault(); set({ q: busca.trim() || undefined }) }}>
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={e => setBusca(e.target.value)} onBlur={() => set({ q: busca.trim() || undefined })}
              placeholder="Buscar descrição" aria-label="Buscar descrição"
              className="w-full border border-line rounded-xl pl-9 pr-3 py-2 text-sm bg-surface text-ink" />
          </form>
          {temFiltro && (
            <button type="button" onClick={() => { setBusca(''); set({ categoria: undefined, conta: undefined, q: undefined }) }}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-muted hover:text-ink">
              <X className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={periodo === 'mes' ? 'Recebido no mês' : 'Recebido no período'} money={totalAtual} icon={TrendingUp} color="var(--success)"
          delta={variacao(totalAtual, totalAnt)} goodWhen="up" hint={periodo === 'mes' ? 'vs mês anterior' : 'vs período anterior'} loading={loading} />
        <StatCard label="Média mensal (12 meses)" money={media12} icon={CalendarRange} color="var(--ink)" hint="meses com receita" loading={loading} />
        <StatCard label="Principal fonte" value={maior ? maior.nome : '—'} icon={Trophy} color="var(--brand)" hint={maior ? brl(maior.valor) : undefined} loading={loading} />
        <StatCard label="Lançamentos" value={String(filtradas.length)} icon={Hash} color="var(--pou)" loading={loading} />
      </div>

      {!loading && txs.filter(isReceita).length === 0 ? (
        <Card><EmptyState icon={TrendingUp} title="Nenhuma receita no período">Importe o extrato da conta onde você recebe para ver suas entradas.</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-3">
              <CardHeader title="Receitas dos últimos 12 meses" subtitle="A linha é a média. Clique em um mês para abri-lo" />
              {loading ? <Skeleton className="h-[260px] w-full" /> : (
                <div style={{ height: 260 }} role="img" aria-label="Receitas por mês">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serie12} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                      onClick={(e: any) => { if (e?.activeLabel) set({ mes: String(e.activeLabel), periodo: 'mes' }) }} style={{ cursor: 'pointer' }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="mes" {...axisProps} tickFormatter={(m: string) => monthLabel(m, 'short')} />
                      <YAxis {...axisProps} tickFormatter={axisCompact} width={56} />
                      <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip title={(l) => monthLabel(String(l))} />} />
                      {media12 > 0 && <ReferenceLine y={media12} stroke="var(--ink)" strokeDasharray="4 4" />}
                      <defs>
                        <linearGradient id="rc-bar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--success)" stopOpacity={1} />
                          <stop offset="100%" stopColor="var(--success)" stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <Bar dataKey="receitas" name="Receitas" maxBarSize={32} fill="url(#rc-bar)" radius={[8, 8, 2, 2]}>
                        {serie12.map(d => <Cell key={d.mes} fillOpacity={meses.includes(d.mes) ? 1 : 0.35} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Fontes de receita" subtitle={fonte ? 'Clique de novo para tirar o filtro' : 'Agrupadas pela descrição. Clique para filtrar'} />
              {loading ? <Skeleton className="h-[260px] w-full" /> : (
                fontes.length === 0 ? <p className="text-sm text-muted py-8 text-center">Sem receitas no período.</p> : (
                  <InteractiveDonut centerLabel="Recebido no período" size={170} selected={fonte}
                    items={fontes.map((f, i) => ({ id: f.chave, label: f.nome, value: f.valor, color: f.chave === '__outras__' ? 'var(--muted)' : CAT_SERIES[i % CAT_SERIES.length] }))}
                    onSelect={id => set({ categoria: id === '__outras__' || id === fonte ? undefined : id })} />
                )
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Lançamentos" subtitle={`${filtradas.length} receita${filtradas.length !== 1 ? 's' : ''} · ${brl(totalAtual)}`} />
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
        </>
      )}
    </div>
  )
}
