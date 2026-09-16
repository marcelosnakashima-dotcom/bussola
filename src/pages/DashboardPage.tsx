import { useState } from 'react'
import { TrendingUp, TrendingDown, Calendar, Target, ArrowRight, Repeat, X, Pencil, Check } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useSummary, useCategoryTotals, useAssets, useDebts, useTransactions, useRecurringExpenses } from '@/hooks/useData'
import { formatBRL, formatDate, type Debt } from '@/lib/supabase'
import { DistributionBar } from '@/components/charts/DistributionBar'
import { SaldoChart, CategoriaChart } from '@/components/charts/AnimatedCharts'

const DEBT_TIPO_LABELS: Record<Debt['tipo'], string> = {
  financiamento_imovel: 'Financiamento imobiliário',
  financiamento_veiculo: 'Financiamento de veículo',
  emprestimo: 'Empréstimo',
  cartao_credito: 'Cartão de crédito',
  terceiros: 'Dívida com terceiros',
  outro: 'Outro',
}

export function DashboardPage() {
  const [month] = useState<Date>(new Date())
  const { summary, loading: sumLoading } = useSummary(month)
  const categoryTotals = useCategoryTotals(month)
  const { assets, total: patrimonioTotal, loading: assetsLoading } = useAssets()
  const { debts, total: dividasTotal, loading: debtsLoading } = useDebts()
  const { transactions, loading: txLoading } = useTransactions(month)
  const { expenses: recurringExpenses, loading: recurringLoading, deactivate: deactivateRecurring, update: updateRecurring } = useRecurringExpenses()

  const monthLabel = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const recentTx   = transactions.filter(t => t.status === 'confirmada').slice(0, 6)

  // ─── Edição inline de despesa recorrente ──────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ description: string; category: string; amount: number | ''; due_day: number | '' }>({
    description: '', category: '', amount: '', due_day: '',
  })

  const startEdit = (e: { id: string; description: string; category: string | null; amount: number; due_day: number }) => {
    setEditingId(e.id)
    setEditForm({ description: e.description, category: e.category ?? '', amount: e.amount, due_day: e.due_day })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id: string) => {
    await updateRecurring(id, {
      description: editForm.description || 'Despesa recorrente',
      category: editForm.category || null,
      amount: editForm.amount === '' ? 0 : Number(editForm.amount),
      due_day: editForm.due_day === '' ? 1 : Number(editForm.due_day),
    })
    setEditingId(null)
  }

  const handleEditAmountChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const digits = ev.target.value.replace(/\D/g, '')
    setEditForm(prev => ({ ...prev, amount: digits ? parseInt(digits, 10) / 100 : '' }))
  }

  const cards = [
    {
      label: 'RECEITAS',
      value: summary?.totalReceitas ?? 0,
      sub: '+0% vs mês anterior',
      Icon: TrendingUp,
      color: '#16A34A',
    },
    {
      label: 'DESPESAS',
      value: summary?.totalDespesas ?? 0,
      sub: 'total do mês',
      Icon: TrendingDown,
      color: '#DC2626',
    },
    {
      label: 'SOBROU NO MÊS',
      value: summary?.sobrou ?? 0,
      sub: summary && summary.renda > 0
        ? `${Math.round((summary.sobrou / summary.renda) * 100)}% da renda`
        : '—',
      Icon: Calendar,
      color: '#2A6049',
    },
    {
      label: 'PATRIMÔNIO TOTAL',
      value: patrimonioTotal,
      sub: `${assetsLoading ? '...' : assets.length} ativos cadastrados`,
      Icon: Target,
      color: '#2563EB',
    },
  ]

  const isLoading = sumLoading || txLoading

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
          Visão geral
        </h1>
        <p className="text-sm mt-0.5 capitalize" style={{ color: 'var(--muted)' }}>
          {monthLabel} · resumo do seu mês
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, sub, Icon, color }) => (
          <div key={label} className="rounded-2xl border bg-white p-4"
            style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--muted)' }}>
                {label}
              </span>
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
            </div>
            {isLoading
              ? <div className="h-7 w-28 rounded animate-pulse" style={{ background: 'var(--border)' }} />
              : <p className="font-display text-xl leading-tight" style={{ color: 'var(--ink)' }}>
                  {formatBRL(value)}
                </p>
            }
            <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Evolução do saldo */}
      <SaldoChart />

      {/* 50/30/20 */}
      {summary && (
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--muted)' }}>
                ESTRATÉGIA 50/30/20
              </p>
              <h2 className="font-display text-lg mt-0.5" style={{ color: 'var(--ink)' }}>
                Como sua renda foi distribuída
              </h2>
            </div>
            <div className="text-right">
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Renda do mês</p>
              <p className="font-display text-base" style={{ color: 'var(--ink)' }}>
                {formatBRL(summary.renda)}
              </p>
            </div>
          </div>
          <DistributionBar classes={summary.classes} renda={summary.renda} />
          <div className="grid grid-cols-3 gap-4 mt-4">
            {summary.classes.map(cl => (
              <div key={cl.classificacao}
                className="border-l-2 pl-3"
                style={{
                  borderColor: cl.classificacao === 'necessidade' ? '#2A6049'
                    : cl.classificacao === 'desejo' ? '#D97706' : '#2563EB'
                }}>
                <p className="text-[10px] font-mono uppercase" style={{ color: 'var(--muted)' }}>
                  {cl.classificacao}
                </p>
                <p className="font-display text-lg leading-tight" style={{ color: 'var(--ink)' }}>
                  {Math.round(cl.pct * 100)}%
                </p>
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {formatBRL(cl.total)}
                </p>
                <p className="text-[11px]" style={{ color: cl.total > cl.meta ? '#DC2626' : 'var(--muted)' }}>
                  {cl.total > cl.meta ? 'acima' : 'abaixo'} da meta · {formatBRL(cl.meta)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Últimas despesas */}
        <div className="lg:col-span-3 rounded-2xl border bg-white" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Últimas despesas</h3>
            <Link to="/importar" className="text-sm flex items-center gap-1 hover:underline"
              style={{ color: 'var(--brand)' }}>
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {txLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="h-4 w-32 rounded animate-pulse" style={{ background: 'var(--border)' }} />
                    <div className="h-4 w-20 rounded animate-pulse" style={{ background: 'var(--border)' }} />
                  </div>
                ))
              : recentTx.length === 0
              ? <div className="px-5 py-8 text-center">
                  <p style={{ color: 'var(--muted)' }} className="text-sm">Nenhuma despesa este mês.</p>
                  <Link to="/importar" className="text-sm mt-2 inline-block hover:underline"
                    style={{ color: 'var(--brand)' }}>
                    Importar fatura →
                  </Link>
                </div>
              : recentTx.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                        {t.descricao}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                        {t.categoria_id ?? 'Sem categoria'} · {formatDate(t.data)}
                      </p>
                    </div>
                    <p className={`text-sm font-mono font-medium flex-shrink-0 ${
                      t.tipo === 'despesa' ? 'text-red-600' : 'text-green-700'
                    }`}>
                      {t.tipo === 'despesa' ? '-' : '+'}{formatBRL(t.valor)}
                    </p>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Donut chart (animado e colorido) */}
        <div className="lg:col-span-2">
          <CategoriaChart data={categoryTotals} />
        </div>
      </div>

      {/* Despesas recorrentes */}
      {!recurringLoading && recurringExpenses.length > 0 && (
        <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--border)' }}>
          <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Despesas recorrentes</h3>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Cobranças automáticas cadastradas — consórcios, financiamentos e assinaturas.
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recurringExpenses.map(e => (
              editingId === e.id ? (
                <div key={e.id} className="px-5 py-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--muted)' }}>Descrição</label>
                      <input type="text" value={editForm.description}
                        onChange={ev => setEditForm(prev => ({ ...prev, description: ev.target.value }))}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }} />
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
                      <input type="text" value={editForm.category}
                        onChange={ev => setEditForm(prev => ({ ...prev, category: ev.target.value }))}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--muted)' }}>Valor</label>
                      <input type="text" inputMode="numeric" placeholder="R$ 0,00"
                        value={editForm.amount === '' ? '' : formatBRL(Number(editForm.amount))}
                        onChange={handleEditAmountChange}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm font-mono" style={{ borderColor: 'var(--border)' }} />
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--muted)' }}>Dia do vencimento</label>
                      <input type="number" min={1} max={31} value={editForm.due_day}
                        onChange={ev => setEditForm(prev => ({ ...prev, due_day: ev.target.value === '' ? '' : Number(ev.target.value) }))}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <button onClick={() => saveEdit(e.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: 'var(--brand)' }}>
                      <Check className="w-3.5 h-3.5" /> Salvar
                    </button>
                    <button onClick={cancelEdit}
                      className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--border)' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div key={e.id} className="flex items-center justify-between px-5 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                      {e.description}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                      {e.category ?? 'Sem categoria'} · todo dia {e.due_day}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="text-sm font-mono font-medium" style={{ color: 'var(--ink)' }}>
                      {formatBRL(e.amount)}
                    </p>
                    <button onClick={() => startEdit(e)}
                      title="Editar despesa recorrente"
                      className="p-1 rounded hover:bg-gray-100 transition-colors">
                      <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    </button>
                    <button onClick={() => deactivateRecurring(e.id)}
                      title="Remover despesa recorrente"
                      className="p-1 rounded hover:bg-gray-100 transition-colors">
                      <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Assets preview */}
      {assets.length > 0 && (
        <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Ativos e patrimônio</h3>
            <Link to="/ativos" className="text-sm flex items-center gap-1 hover:underline"
              style={{ color: 'var(--brand)' }}>
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
            {assets.slice(0, 4).map(a => (
              <div key={a.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
                  {a.tipo}
                </p>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{a.nome}</p>
                <p className="font-display text-base mt-1" style={{ color: 'var(--ink)' }}>
                  {formatBRL(a.valor)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debts preview */}
      {!debtsLoading && debts.length > 0 && (
        <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h3 className="font-display text-lg" style={{ color: 'var(--ink)' }}>Dívidas e financiamentos</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Total em aberto: <span style={{ color: '#DC2626' }}>{formatBRL(dividasTotal)}</span>
              </p>
            </div>
            <Link to="/dividas" className="text-sm flex items-center gap-1 hover:underline"
              style={{ color: 'var(--brand)' }}>
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
            {debts.slice(0, 4).map(d => (
              <div key={d.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
                  {DEBT_TIPO_LABELS[d.tipo] ?? d.tipo}
                </p>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{d.nome}</p>
                <p className="font-display text-base mt-1" style={{ color: '#DC2626' }}>
                  {formatBRL(d.valor)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
