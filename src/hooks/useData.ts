import { useEffect, useState, useCallback } from 'react'
import { supabase, type Category, type Transaction, type Asset, type Debt, type ImportBatch, type UserPlan, type NotificationSettings, type RecurringExpense, type HouseholdMember } from '@/lib/supabase'
import { startOfMonth, endOfMonth, format } from 'date-fns'

// ─── Auth / household helpers ─────────────────────────────────────
async function uid() {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// Grupo familiar do usuario logado. Todos os dados financeiros (ativos,
// dividas, despesas recorrentes, plano 50/30/20, diagnostico e transacoes)
// sao compartilhados entre todos os logins que pertencem ao mesmo household
// — por exemplo, um casal onde cada um tem seu proprio e-mail/senha.
let _householdId: string | null | undefined = undefined

async function myHouseholdId() {
  if (_householdId !== undefined) return _householdId
  const userId = await uid()
  if (!userId) return null
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle()
  _householdId = data?.household_id ?? null
  return _householdId
}

// ─── Categories (static, cached globally) ──────────────────────
let _cats: Category[] | null = null

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(_cats ?? [])
  const [loading, setLoading] = useState(!_cats)

  useEffect(() => {
    if (_cats) return
    supabase.from('categories').select('*').then(({ data }) => {
      _cats = data ?? []
      setCategories(_cats)
      setLoading(false)
    })
  }, [])

  const byId = (id: string | null) => categories.find(c => c.id === id)
  return { categories, loading, byId }
}

// ─── Household (grupo familiar) ───────────────────────────────────────────
// Lista quem mais compartilha os dados com o usuario logado (por exemplo,
// o outro login de um casal). Util para mostrar no Perfil.
export function useHouseholdMembers() {
  const [members, setMembers] = useState<{ id: string; email: string | null; isMe: boolean }[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    (async () => {
      const userId = await uid()
      const householdId = await myHouseholdId()
      if (!userId || !householdId) { setLoading(false); return }
      const { data } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', householdId)
      const { data: userData } = await supabase.auth.getUser()
      const list = (data ?? []).map((m: Pick<HouseholdMember, 'user_id'>) => ({
        id: m.user_id,
        email: m.user_id === userId ? (userData.user?.email ?? null) : null,
        isMe: m.user_id === userId,
      }))
      setMembers(list)
      setLoading(false)
    })()
  }, [])

  return { members, loading }
}

// ─── Transactions ────────────────────────────────────────────
export function useTransactions(month?: Date) {
  const ref   = month ?? new Date()
  const from  = format(startOfMonth(ref), 'yyyy-MM-dd')
  const to    = format(endOfMonth(ref), 'yyyy-MM-dd')

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const householdId = await myHouseholdId()
    if (!householdId) { setLoading(false); return }

    const { data, error: err } = await supabase
      .from('transactions')
      .select('*')
      .eq('household_id', householdId)
      .gte('data', from)
      .lte('data', to)
      .order('data', { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }
    setTransactions(data ?? [])
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  const addTransaction = async (t: Omit<Transaction, 'id' | 'user_id' | 'household_id' | 'created_at'>) => {
    const userId = await uid()
    const householdId = await myHouseholdId()
    if (!userId || !householdId) return null
    const { data, error: err } = await supabase
      .from('transactions')
      .insert({ ...t, user_id: userId, household_id: householdId })
      .select()
      .single()
    if (err) return null
    await load()
    return data
  }

  const deleteTransaction = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id)
    await load()
  }

  const bulkInsert = async (items: Omit<Transaction, 'id' | 'user_id' | 'household_id' | 'created_at'>[]) => {
    const userId = await uid()
    const householdId = await myHouseholdId()
    if (!userId || !householdId) throw new Error('Not authenticated')
    const { error: err } = await supabase
      .from('transactions')
      .insert(items.map(t => ({ ...t, user_id: userId, household_id: householdId })))
    if (err) throw err
    await load()
  }

  return { transactions, loading, error, refresh: load, addTransaction, deleteTransaction, bulkInsert }
}

// ─── Summary ───────────────────────────────────────────────
export function useSummary(month?: Date) {
  const { transactions, loading: txLoading }  = useTransactions(month)
  const { categories, loading: catLoading }   = useCategories()
  const { plan, loading: planLoading }        = usePlan()

  if (txLoading || catLoading || planLoading) return { loading: true, summary: null }

  const despesas   = transactions.filter(t => t.tipo === 'despesa' && t.status === 'confirmada')
  const receitas   = transactions.filter(t => t.tipo === 'receita' && t.status === 'confirmada')
  const totalDespesas = despesas.reduce((s, t) => s + Number(t.valor), 0)
  const totalReceitas = receitas.reduce((s, t) => s + Number(t.valor), 0)
  const sobrou        = totalReceitas - totalDespesas
  const renda         = plan.renda_base ? Number(plan.renda_base) : totalReceitas

  const classTotals = { necessidade: 0, desejo: 0, poupanca: 0 } as Record<string, number>
  for (const t of despesas) {
    const cat = categories.find(c => c.id === t.categoria_id)
    if (cat) classTotals[cat.classificacao] += Number(t.valor)
  }

  const classes = (['necessidade', 'desejo', 'poupanca'] as const).map(cl => ({
    classificacao: cl,
    total: classTotals[cl],
    meta:  renda * Number(plan[cl]),
    pct:   renda ? classTotals[cl] / renda : 0,
  }))

  return { loading: false, summary: { totalDespesas, totalReceitas, sobrou, renda, classes, plan } }
}

// ─── Category totals (for donut chart) ─────────────────────────
export function useCategoryTotals(month?: Date) {
  const { transactions } = useTransactions(month)
  const { categories }   = useCategories()

  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.tipo !== 'despesa' || t.status !== 'confirmada') continue
    const key = t.categoria_id ?? '__sem__'
    map.set(key, (map.get(key) ?? 0) + Number(t.valor))
  }

  return Array.from(map.entries())
    .map(([id, valor]) => ({
      id,
      nome:          categories.find(c => c.id === id)?.nome ?? 'Sem categoria',
      classificacao: categories.find(c => c.id === id)?.classificacao,
      valor,
    }))
    .sort((a, b) => b.valor - a.valor)
}

// ─── Assets ────────────────────────────────────────────────
export function useAssets() {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const householdId = await myHouseholdId()
    if (!householdId) { setLoading(false); return }
    const { data } = await supabase
      .from('assets')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at')
    setAssets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addAsset = async (a: Omit<Asset, 'id' | 'user_id' | 'household_id' | 'created_at' | 'updated_at'>) => {
    const userId = await uid()
    const householdId = await myHouseholdId()
    if (!userId || !householdId) return
    await supabase.from('assets').insert({ ...a, user_id: userId, household_id: householdId })
    await load()
  }

  const updateAsset = async (id: string, a: Partial<Omit<Asset, 'id' | 'user_id' | 'household_id'>>) => {
    await supabase.from('assets').update(a).eq('id', id)
    await load()
  }

  const deleteAsset = async (id: string) => {
    await supabase.from('assets').delete().eq('id', id)
    await load()
  }

  const total = assets.reduce((s, a) => s + Number(a.valor), 0)
  return { assets, loading, total, refresh: load, addAsset, updateAsset, deleteAsset }
}

// ─── Import batches (histórico de importações de PDF) ─────────
export function useImportBatches() {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const householdId = await myHouseholdId()
    if (!householdId) { setLoading(false); return }
    const { data } = await supabase
      .from('import_batches')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
    setBatches(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addBatch = async (b: Omit<ImportBatch, 'id' | 'user_id' | 'household_id' | 'created_at'>) => {
    const userId = await uid()
    const householdId = await myHouseholdId()
    if (!userId || !householdId) return
    await supabase.from('import_batches').insert({ ...b, user_id: userId, household_id: householdId })
    await load()
  }

  return { batches, loading, refresh: load, addBatch }
}

// ─── Debts (dívidas e financiamentos) ──────────────────────────────────
export function useDebts() {
  const [debts,   setDebts]   = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const householdId = await myHouseholdId()
    if (!householdId) { setLoading(false); return }
    const { data } = await supabase
      .from('debts')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at')
    setDebts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addDebt = async (d: Omit<Debt, 'id' | 'user_id' | 'household_id' | 'created_at' | 'updated_at'>) => {
    const userId = await uid()
    const householdId = await myHouseholdId()
    if (!userId || !householdId) return
    await supabase.from('debts').insert({ ...d, user_id: userId, household_id: householdId })
    await load()
  }

  const updateDebt = async (id: string, d: Partial<Omit<Debt, 'id' | 'user_id' | 'household_id'>>) => {
    await supabase.from('debts').update(d).eq('id', id)
    await load()
  }

  const deleteDebt = async (id: string) => {
    await supabase.from('debts').delete().eq('id', id)
    await load()
  }

  const total = debts.reduce((s, d) => s + Number(d.valor), 0)
  return { debts, loading, total, refresh: load, addDebt, updateDebt, deleteDebt }
}

// ─── Recurring expenses ────────────────────────────────────────────
export function useRecurringExpenses() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const householdId = await myHouseholdId()
    if (!householdId) { setLoading(false); return }
    const { data } = await supabase
      .from('recurring_expenses')
      .select('*')
      .eq('household_id', householdId)
      .eq('active', true)
      .order('due_day', { ascending: true })
    setExpenses(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const deactivate = async (id: string) => {
    await supabase.from('recurring_expenses').update({ active: false }).eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const update = async (id: string, e: Partial<Pick<RecurringExpense, 'description' | 'category' | 'amount' | 'due_day'>>) => {
    await supabase.from('recurring_expenses').update(e).eq('id', id)
    await load()
  }

  return { expenses, loading, refresh: load, deactivate, update }
}

// ─── Plan ───────────────────────────────────────────────────
const DEFAULT_PLAN: Omit<UserPlan, 'household_id' | 'user_id' | 'updated_at'> = {
  necessidade: 0.5, desejo: 0.3, poupanca: 0.2
}

export function usePlan() {
  const [plan,    setPlan]    = useState<Omit<UserPlan, 'household_id' | 'user_id' | 'updated_at'>>(DEFAULT_PLAN)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const householdId = await myHouseholdId()
      if (!householdId) { setLoading(false); return }
      const { data } = await supabase
        .from('user_plan').select('*').eq('household_id', householdId).maybeSingle()
      if (data) setPlan({ necessidade: Number(data.necessidade), desejo: Number(data.desejo), poupanca: Number(data.poupanca), renda_base: data.renda_base ? Number(data.renda_base) : undefined })
      setLoading(false)
    })()
  }, [])

  const savePlan = async (p: typeof DEFAULT_PLAN) => {
    const userId = await uid()
    const householdId = await myHouseholdId()
    if (!userId || !householdId) return
    await supabase.from('user_plan').upsert({ household_id: householdId, user_id: userId, ...p })
    setPlan(p)
  }

  return { plan, loading, savePlan }
}

// ─── Notification settings (pessoal, nao compartilhado) ────────────────────────
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    const userId = await uid()
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('notification_settings').select('*').eq('user_id', userId).maybeSingle()
    setSettings(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (enabled: boolean, lead_days: number) => {
    const userId = await uid()
    if (!userId) return
    const { data } = await supabase
      .from('notification_settings')
      .upsert({ user_id: userId, enabled, lead_days })
      .select()
      .single()
    setSettings(data)
  }

  return { settings, loading, save, refresh: load }
}

// ─── User role ──────────────────────────────────────────────
export function useUserRole() {
  const [role,    setRole]    = useState<'user' | 'admin'>('user')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const userId = await uid()
      if (!userId) { setLoading(false); return }
      const { data } = await supabase
        .from('user_roles').select('role').eq('user_id', userId).maybeSingle()
      setRole(data?.role ?? 'user')
      setLoading(false)
    })()
  }, [])

  return { role, loading, isAdmin: role === 'admin' }
}

// ─── Diagnóstico financeiro ──────────────────────────────────────
// Depois de salvar o diagnóstico, traduz automaticamente as respostas em
// registros reais do dashboard (renda base, ativos, dívidas e despesas
// recorrentes) — todos vinculados ao household, e portanto visíveis para
// qualquer outro login que compartilhe a mesma conta. Roda em "melhor
// esforço": se essa etapa falhar, o diagnóstico em si já foi salvo e não
// é desfeito.
async function aplicarDiagnosticoNoDashboard(householdId: string, userId: string, r: Record<string, any>) {
  const num = (v: any): number | null => (typeof v === 'number' && v > 0 ? v : null)

  // 1. Renda informada vira a base do plano 50/30/20
  const renda = (num(r.rendaFixa) ?? 0) + (num(r.rendaVariavel) ?? 0) + (num(r.outrasRendas) ?? 0)
  if (renda > 0) {
    const { data: planoAtual } = await supabase
      .from('user_plan').select('necessidade, desejo, poupanca').eq('household_id', householdId).maybeSingle()
    await supabase.from('user_plan').upsert({
      household_id: householdId,
      user_id: userId,
      necessidade: planoAtual?.necessidade ?? 0.5,
      desejo: planoAtual?.desejo ?? 0.3,
      poupanca: planoAtual?.poupanca ?? 0.2,
      renda_base: renda,
    })
  }

  // 2. Patrimônio declarado vira registros em "Ativos"
  const ativos: { tipo: string; nome: string; valor: number }[] = []
  if (num(r.imoveis))             ativos.push({ tipo: 'imovel',       nome: 'Imóveis',                      valor: num(r.imoveis)! })
  if (num(r.veiculos))            ativos.push({ tipo: 'outro',        nome: 'Veículos',                     valor: num(r.veiculos)! })
  if (r.temInvestimentos === true && num(r.valorInvestimentos))
                                   ativos.push({ tipo: 'investimento', nome: 'Investimentos financeiros',    valor: num(r.valorInvestimentos)! })
  if (num(r.participacoes))       ativos.push({ tipo: 'outro',        nome: 'Participações societárias',    valor: num(r.participacoes)! })
  if (num(r.saldoContas))         ativos.push({ tipo: 'outro',        nome: 'Saldo em conta / poupança',     valor: num(r.saldoContas)! })
  if (num(r.valorReserva))        ativos.push({ tipo: 'reserva',      nome: 'Reserva de emergência',        valor: num(r.valorReserva)! })
  if (r.apoliceVida === true && num(r.valorApolice))
                                   ativos.push({ tipo: 'seguro',       nome: 'Seguro de vida',               valor: num(r.valorApolice)! })
  if (num(r.consorciosAndamento)) ativos.push({ tipo: 'consorcio',    nome: 'Consórcio em andamento',       valor: num(r.consorciosAndamento)! })

  for (const a of ativos) {
    await supabase.from('assets').insert({
      household_id: householdId,
      user_id: userId,
      tipo: a.tipo,
      nome: a.nome,
      valor: a.valor,
      detalhe: 'Importado automaticamente do diagnóstico financeiro.',
    })
  }

  // 3. Dívidas declaradas viram registros em "Dívidas"
  const dividas: { tipo: string; nome: string; valor: number }[] = []
  if (num(r.financiamentoImovel))  dividas.push({ tipo: 'financiamento_imovel',  nome: 'Financiamento imobiliário', valor: num(r.financiamentoImovel)! })
  if (num(r.financiamentoVeiculo)) dividas.push({ tipo: 'financiamento_veiculo', nome: 'Financiamento de veículo',  valor: num(r.financiamentoVeiculo)! })
  if (num(r.emprestimos))          dividas.push({ tipo: 'emprestimo',            nome: 'Empréstimos pessoais',      valor: num(r.emprestimos)! })
  if (num(r.cartaoCredito))        dividas.push({ tipo: 'cartao_credito',        nome: 'Cartão de crédito',         valor: num(r.cartaoCredito)! })
  if (num(r.dividasTerceiros))     dividas.push({ tipo: 'terceiros',             nome: 'Dívidas com terceiros',     valor: num(r.dividasTerceiros)! })

  for (const d of dividas) {
    await supabase.from('debts').insert({
      household_id: householdId,
      user_id: userId,
      tipo: d.tipo,
      nome: d.nome,
      valor: d.valor,
      detalhe: 'Importado automaticamente do diagnóstico financeiro.',
    })
  }

  // 4. Despesas fixas declaradas viram "Despesas recorrentes"
  // (despesas variáveis e sazonais não viram lançamento fixo por não terem
  // um dia de vencimento real — ficam guardadas no registro do diagnóstico)
  const despesas: { description: string; category: string; amount: number }[] = []
  if (num(r.moradia))      despesas.push({ description: 'Moradia (via diagnóstico)',     category: 'Moradia',     amount: num(r.moradia)! })
  if (num(r.educacao))     despesas.push({ description: 'Educação (via diagnóstico)',    category: 'Educação',    amount: num(r.educacao)! })
  if (num(r.saudeDespesa)) despesas.push({ description: 'Saúde (via diagnóstico)',       category: 'Saúde',       amount: num(r.saudeDespesa)! })
  if (num(r.transporte))   despesas.push({ description: 'Transporte (via diagnóstico)',  category: 'Transporte',  amount: num(r.transporte)! })
  if (num(r.assinaturas))  despesas.push({ description: 'Assinaturas (via diagnóstico)',  category: 'Assinaturas', amount: num(r.assinaturas)! })

  for (const d of despesas) {
    await supabase.from('recurring_expenses').insert({
      household_id: householdId,
      user_id: userId,
      description: d.description,
      category: d.category,
      amount: d.amount,
      due_day: 10,
      active: true,
    })
  }
}

export function useDiagnostico() {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async (respostas: Record<string, any>) => {
    setSalvando(true)
    setErro(null)
    const userId = await uid()
    const householdId = await myHouseholdId()
    if (!userId || !householdId) {
      setSalvando(false)
      setErro('Você precisa estar logado para salvar o diagnóstico.')
      return null
    }
    const termoAceito = respostas.termoAceite === true
    const { data, error: err } = await supabase
      .from('diagnosticos')
      .insert({
        user_id: userId,
        household_id: householdId,
        nome_cliente: respostas.nomeCompleto ?? null,
        telefone: respostas.telefone ?? null,
        email: respostas.email ?? null,
        respostas,
        concluido: true,
        termo_aceito: termoAceito,
        termo_aceito_em: termoAceito ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (err) {
      setSalvando(false)
      setErro('Não foi possível salvar agora. Tenta de novo em instantes.')
      return null
    }

    try {
      await aplicarDiagnosticoNoDashboard(householdId, userId, respostas)
    } catch {
      // melhor esforço: o diagnóstico já foi salvo mesmo que essa etapa falhe
    }

    setSalvando(false)
    return data
  }

  return { salvar, salvando, erro }
}
