import { useState } from 'react'
import { TrendingUp, TrendingDown, Calendar, Target, ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useSummary, useCategoryTotals, useAssets, useTransactions } from '@/hooks/useData'
import { formatBRL, formatDate } from '@/lib/supabase'
import { NotificationSettings } from '@/components/notifications/NotificationSettings'
import { DonutChart } from '@/components/charts/DonutChart'
import { DistributionBar } from '@/components/charts/DistributionBar'

const CATEGORY_COLORS = [
  '#2A6049','#3C7A5C','#1E4535','#6B9E80','#4A8C67',
  '#8BBF9F','#2E7D52','#5A9E72','#1A5C3A','#7BB89A',
]

export function DashboardPage() {
  const [month] = useState<Date>(new Date())
  const { summary, loading: sumLoading } = useSummary(month)
  const categoryTotals = useCategoryTotals(month)
  const { assets, total: patrimonioTotal, loading: assetsLoading } = useAssets()
  const { transactions, loading: txLoading } = useTransactions(month)

  const monthLabel = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const recentTx   = transactions.filter(t => t.status === 'confirmada').slice(0, 6)

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

      {/* Notifications */}
      <NotificationSettings />

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

        {/* Donut chart */}
        <div className="lg:col-span-2 rounded-2xl border bg-white p-5"
          style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-display text-lg mb-4" style={{ color: 'var(--ink)' }}>
            Gastos por categoria
          </h3>
          {categoryTotals.length === 0
            ? <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>
                Sem dados neste mês
              </p>
            : <>
                <DonutChart data={categoryTotals} colors={CATEGORY_COLORS} />
                <div className="mt-4 space-y-1.5">
                  {categoryTotals.slice(0, 6).map((c, i) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      <span className="truncate flex-1" style={{ color: 'var(--ink)' }}>{c.nome}</span>
                      <span className="font-mono flex-shrink-0" style={{ color: 'var(--muted)' }}>
                        {formatBRL(c.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
          }
        </div>
      </div>

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
    </div>
  )
}
