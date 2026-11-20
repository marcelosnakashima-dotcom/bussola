import { Badge } from '@/components/ui/Badge'
import { CLASS_COLOR } from '@/components/charts/kit'
import { brl } from '@/lib/format'
import { groupByDay, valorDe, type CatInfo, type Tx } from '@/lib/finance'

const fmtDia = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).replace(/\./g, '')
}

// Lançamentos agrupados por dia. Mostra a conta quando houver.
export function TransactionList({ txs, cats, accountName, limit }: {
  txs: Tx[]
  cats: Map<string, CatInfo>
  accountName?: (id?: string | null) => string | null
  limit?: number
}) {
  const lista = limit ? [...txs].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, limit) : txs
  const dias = groupByDay(lista)
  if (dias.length === 0) return <p className="text-sm text-muted py-8 text-center">Nenhum lançamento.</p>
  return (
    <div className="flex flex-col">
      {dias.map(d => (
        <div key={d.data}>
          <div className="flex items-center justify-between px-1 pt-3 pb-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted capitalize">{fmtDia(d.data)}</p>
            {!limit && <p className="num text-[11px] text-muted">{brl(d.total)}</p>}
          </div>
          <ul className="rounded-xl border border-line divide-y divide-[var(--border)] bg-surface">
            {d.itens.map(t => {
              const cat = t.categoria_id ? cats.get(t.categoria_id) : undefined
              const conta = accountName?.(t.account_id)
              const receita = t.tipo === 'receita'
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="w-1.5 h-8 rounded-full shrink-0" aria-hidden="true"
                      style={{ background: receita ? 'var(--success)' : cat ? CLASS_COLOR[cat.classificacao] : 'var(--border)' }} />
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{t.descricao}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {!receita && <Badge>{cat?.nome ?? 'Sem categoria'}</Badge>}
                        {conta && <span className="text-[11px] text-muted truncate">{conta}</span>}
                      </div>
                    </div>
                  </div>
                  <p className="num text-sm font-medium shrink-0" style={{ color: receita ? 'var(--success)' : 'var(--ink)' }}>
                    {receita ? '+' : '−'}{brl(valorDe(t))}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
