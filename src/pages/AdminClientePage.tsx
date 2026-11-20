import { useMemo } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, CreditCard, FileUp, Landmark, LineChart, PiggyBank, ShieldCheck, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useAdminCliente } from '@/hooks/useAdmin'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { FluxoChart } from '@/components/finance/FluxoChart'
import { InteractiveDonut } from '@/components/charts/InteractiveDonut'
import { CAT_SERIES, CLASS_COLOR, CLASS_LABEL } from '@/components/charts/kit'
import { brl, variacao } from '@/lib/format'
import { tempoDesde } from '@/lib/admin'
import { formatDate } from '@/lib/supabase'
import type { MesSerie } from '@/lib/finance'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function AdminClientePage() {
  const { householdId } = useParams({ strict: false }) as { householdId: string }
  const valido = UUID.test(householdId ?? '')
  const { detalhe, loading, error } = useAdminCliente(valido ? householdId : '00000000-0000-0000-0000-000000000000')
  const navigate = useNavigate()

  const serie: MesSerie[] = useMemo(() => (detalhe?.serie ?? []).map(s => ({
    ...s, receitas: Number(s.receitas), despesas: Number(s.despesas), saldo: Number(s.receitas) - Number(s.despesas),
    necessidade: Number(s.necessidade), desejo: Number(s.desejo), poupanca: Number(s.poupanca),
    semClasse: Math.max(Number(s.despesas) - Number(s.necessidade) - Number(s.desejo) - Number(s.poupanca), 0),
  })), [detalhe])
  const atual = serie[serie.length - 1]
  const anterior = serie[serie.length - 2]
  const nomes = detalhe?.membros.map(m => m.nome).join(' & ') ?? ''
  const liquido = (detalhe?.ativos ?? 0) - (detalhe?.dividas ?? 0)

  if (!valido) return <div className="p-8 text-sm text-muted">Cliente inválido. <Link to="/admin" className="text-brand underline">Voltar</Link></div>

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6 animate-fade-up">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="w-4 h-4" /> Clientes</Link>

      {error ? (
        <p role="alert" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {/não encontrado/.test(error) ? 'Cliente não encontrado.' : /apenas admin/.test(error) ? 'Sua conta não tem permissão de administrador.' : 'Não foi possível carregar o resumo deste cliente.'}
        </p>
      ) : (
        <>
          <PageHeader eyebrow="Cliente" title={loading ? 'Carregando…' : nomes || 'Sem membros'}
            subtitle={detalhe?.membros.map(m => m.email).filter(Boolean).join(' · ')}
            actions={<button type="button" onClick={() => navigate({ to: '/plano', search: { household: householdId } as never })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--brand)' }}>
              <LineChart className="w-4 h-4" /> Abrir o plano</button>} />

          <p className="text-[11px] text-muted flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />
            Somente leitura. Cada abertura deste resumo fica registrada na auditoria.</p>

          {detalhe && (
            <div className="flex flex-wrap gap-2">
              {detalhe.membros.map(m => (
                <span key={m.user_id} className="glass rounded-full px-3 py-1.5 text-xs text-ink">
                  {m.nome} · <span className="text-muted">último acesso {tempoDesde(m.ultimo_acesso)}</span>
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Receitas do mês" money={atual?.receitas ?? 0} icon={TrendingUp} color="var(--success)"
              delta={variacao(atual?.receitas ?? 0, anterior?.receitas ?? 0)} hint="vs mês anterior" loading={loading}
              spark={serie.slice(-6).map(s => s.receitas)} />
            <StatCard label="Despesas do mês" money={atual?.despesas ?? 0} icon={TrendingDown} color="var(--danger)" goodWhen="down"
              delta={variacao(atual?.despesas ?? 0, anterior?.despesas ?? 0)} hint="vs mês anterior" loading={loading}
              spark={serie.slice(-6).map(s => s.despesas)} />
            <StatCard label="Sobrou no mês" money={atual?.saldo ?? 0} icon={PiggyBank} color="var(--brand)" loading={loading}
              spark={serie.slice(-6).map(s => s.saldo)} />
            <StatCard label="Patrimônio líquido" money={liquido} icon={Wallet} color="var(--pou)"
              hint={`ativos ${brl(detalhe?.ativos ?? 0)} · dívidas ${brl(detalhe?.dividas ?? 0)}`} loading={loading} />
          </div>

          <Card>
            <CardHeader title="Fluxo dos últimos 12 meses" subtitle="Toque ou passe o mouse em um mês" />
            {loading ? <Skeleton className="h-[300px] w-full" /> : <FluxoChart data={serie} />}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="50/30/20 do mês" />
              {loading ? <Skeleton className="h-48 w-full" /> : (
                <InteractiveDonut centerLabel="Despesas do mês" size={170}
                  items={(['necessidade', 'desejo', 'poupanca'] as const).map(c => ({ id: c, label: CLASS_LABEL[c], value: atual?.[c] ?? 0, color: CLASS_COLOR[c] }))} />
              )}
            </Card>
            <Card>
              <CardHeader title="Categorias do mês" />
              {loading ? <Skeleton className="h-48 w-full" /> : (detalhe?.categorias_mes.length ?? 0) === 0 ? (
                <p className="text-sm text-muted py-8 text-center">Sem despesas neste mês.</p>
              ) : (
                <InteractiveDonut centerLabel="Despesas do mês" size={170}
                  items={detalhe!.categorias_mes.slice(0, 7).map((c, i) => ({ id: c.nome, label: c.nome, value: Number(c.valor), color: c.classificacao ? CAT_SERIES[i % CAT_SERIES.length] : 'var(--muted)' }))} />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Contas e cartões" />
              {loading ? <Skeleton className="h-32 w-full" /> : (detalhe?.contas.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">Nenhuma conta cadastrada. Sem contas, transferências não são separadas dos gastos.</p>
              ) : (
                <ul className="space-y-2">
                  {detalhe!.contas.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/70 px-3 py-2" style={{ opacity: a.ativo ? 1 : 0.55 }}>
                      <span className="flex items-center gap-3 min-w-0">
                        {a.tipo === 'cartao' ? <CreditCard className="w-4 h-4 text-muted" /> : <Landmark className="w-4 h-4 text-muted" />}
                        <span className="min-w-0">
                          <span className="block text-sm text-ink truncate">{a.apelido}</span>
                          <span className="block text-[11px] text-muted truncate">{a.instituicao}{a.final ? ` · final ${a.final}` : ''}</span>
                        </span>
                      </span>
                      {!a.ativo && <Badge>desativada</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Últimas importações" />
              {loading ? <Skeleton className="h-32 w-full" /> : (detalhe?.importacoes.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">Nenhuma importação ainda.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {detalhe!.importacoes.map((b, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex items-center gap-3 min-w-0">
                        <FileUp className="w-4 h-4 text-muted shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm text-ink truncate">{b.fonte ?? 'Importação'}</span>
                          <span className="block text-[11px] text-muted">
                            {b.periodo_inicio && b.periodo_fim ? `${formatDate(b.periodo_inicio)} – ${formatDate(b.periodo_fim)} · ` : ''}{b.quantidade} lançamentos
                          </span>
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        {b.formato && <Badge>{b.formato.toUpperCase()}</Badge>}
                        <span className="block text-[11px] text-muted mt-0.5">{tempoDesde(b.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
