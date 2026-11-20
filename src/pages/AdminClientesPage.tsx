import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Activity, AlertTriangle, ChevronRight, Search, UserPlus, Users, Wallet } from 'lucide-react'
import { useAdminClientes, type ClienteResumo } from '@/hooks/useAdmin'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { InteractiveDonut } from '@/components/charts/InteractiveDonut'
import { brl } from '@/lib/format'
import { SITUACAO_LABEL, casaBusca, situacaoCliente, tempoDesde, type Situacao } from '@/lib/admin'

const COR: Record<Situacao, string> = { em_dia: 'var(--success)', atencao: 'var(--warning)', parado: 'var(--danger)', sem_dados: 'var(--muted)' }
const TOM: Record<Situacao, 'success' | 'warning' | 'danger' | 'neutral'> = { em_dia: 'success', atencao: 'warning', parado: 'danger', sem_dados: 'neutral' }
type Filtro = 'todos' | Situacao

export function AdminClientesPage() {
  const { clientes, loading, error } = useAdminClientes()
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [mostrarEquipe, setMostrarEquipe] = useState(false)

  const base = useMemo(() => clientes.filter(c => mostrarEquipe || !c.tem_admin), [clientes, mostrarEquipe])
  const comSituacao = useMemo(() => base.map(c => ({ c, ...situacaoCliente(c.ultimo_lancamento) })), [base])
  const contagem = (s: Situacao) => comSituacao.filter(x => x.situacao === s).length
  const visiveis = comSituacao
    .filter(x => (filtro === 'todos' || x.situacao === filtro) && casaBusca(x.c.membros, busca))
    .sort((a, b) => (b.c.ultimo_lancamento ?? '').localeCompare(a.c.ultimo_lancamento ?? ''))
  const ativosNoMes = base.filter(c => c.receitas_mes + c.despesas_mes > 0).length
  const precisam = contagem('atencao') + contagem('parado') + contagem('sem_dados')
  const patrimonio = base.reduce((s, c) => s + c.ativos - c.dividas, 0)

  const nomes = (c: ClienteResumo) => c.membros.map(m => m.nome).join(' & ') || 'Sem membros'

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6 animate-fade-up">
      <PageHeader eyebrow="Administração" title="Clientes"
        subtitle={loading ? 'Carregando…' : `${base.length} grupo${base.length !== 1 ? 's' : ''} familiar${base.length !== 1 ? 'es' : ''}`}
        actions={<Link to="/admin/gestao" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--brand)' }}><UserPlus className="w-4 h-4" /> Novo acesso</Link>} />

      {error && (
        <p role="alert" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {/apenas admin/.test(error) ? 'Sua conta não tem permissão de administrador.' : /admin_clientes/.test(error) ? 'A função admin_clientes ainda não existe no banco: aplique a migração 20261121120000_admin_clientes.sql.' : 'Não foi possível carregar os clientes.'}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Clientes" value={String(base.length)} icon={Users} color="var(--brand)" loading={loading} />
        <StatCard label="Com movimento no mês" value={String(ativosNoMes)} icon={Activity} color="var(--success)"
          hint={base.length ? `${Math.round((ativosNoMes / base.length) * 100)}% da carteira` : undefined} loading={loading} />
        <StatCard label="Precisam de atenção" value={String(precisam)} icon={AlertTriangle} color="var(--warning)" hint="parados, em atenção ou sem dados" loading={loading} />
        <StatCard label="Patrimônio líquido somado" money={patrimonio} icon={Wallet} color="var(--pou)" loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Situação da carteira" subtitle="Pelo último lançamento. Clique para filtrar" />
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <InteractiveDonut centerLabel="Clientes" size={170} format={v => String(Math.round(v))} selected={filtro === 'todos' ? null : filtro}
              onSelect={id => setFiltro(filtro === id ? 'todos' : (id as Situacao))}
              items={(['em_dia', 'atencao', 'parado', 'sem_dados'] as Situacao[]).map(s => ({ id: s, label: SITUACAO_LABEL[s], value: contagem(s), color: COR[s] }))} />
          )}
          <p className="text-[11px] text-muted mt-3">Em dia: lançamento nos últimos 35 dias · Atenção: até 60 · Parado: mais de 60.</p>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-4">
            <Segmented label="Situação" value={filtro} onChange={setFiltro}
              options={[{ value: 'todos', label: 'Todos' }, { value: 'em_dia', label: 'Em dia' }, { value: 'atencao', label: 'Atenção' }, { value: 'parado', label: 'Parados' }, { value: 'sem_dados', label: 'Sem dados' }]} />
            <label className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou e-mail" aria-label="Buscar cliente"
                className="w-full sm:w-56 border border-line rounded-xl pl-9 pr-3 py-2 text-sm" />
            </label>
          </div>
          {loading ? <Skeleton className="h-64 w-full" /> : visiveis.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum cliente encontrado">Ajuste o filtro ou a busca.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-1">
              {visiveis.map(({ c, situacao, dias }) => (
                <li key={c.household_id}>
                  <button type="button" onClick={() => navigate({ to: '/admin/clientes/$householdId', params: { householdId: c.household_id } })}
                    className="w-full text-left rounded-2xl bg-surface-2/60 hover:bg-surface-2 px-4 py-3 transition-colors group">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-ink truncate">{nomes(c)}</p>
                          <Badge tone={TOM[situacao]}>{SITUACAO_LABEL[situacao]}{dias !== null && situacao !== 'em_dia' ? ` · ${dias} dias` : ''}</Badge>
                          {c.tem_admin && <Badge tone="brand">Equipe</Badge>}
                        </div>
                        <p className="text-[11px] text-muted truncate mt-0.5">{c.membros.map(m => m.email).filter(Boolean).join(' · ')}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-[11px] text-muted">
                      <span>Acesso: <b className="text-ink font-medium">{tempoDesde(c.ultimo_acesso)}</b></span>
                      <span>Lançamento: <b className="text-ink font-medium">{tempoDesde(c.ultimo_lancamento)}</b></span>
                      <span>Mês: <b className="num text-success font-medium">{brl(c.receitas_mes)}</b> / <b className="num text-danger font-medium">{brl(c.despesas_mes)}</b></span>
                      <span>Patrimônio: <b className="num text-ink font-medium">{brl(c.ativos - c.dividas)}</b></span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 text-xs text-muted mt-3">
            <input type="checkbox" checked={mostrarEquipe} onChange={e => setMostrarEquipe(e.target.checked)} />
            Mostrar grupos da equipe Arsen
          </label>
        </Card>
      </div>
    </div>
  )
}
