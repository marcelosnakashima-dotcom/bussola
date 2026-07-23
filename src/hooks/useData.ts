import { useEffect, useState, useCallback } from 'react'
import { supabase, type Category, type Transaction, type Asset, type UserPlan, type NotificationSettings } from '@/lib/supabase'
import { startOfMonth, endOfMonth, format } from 'date-fns'

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function uid() {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// ─── Categories (static, cached globally) ────────────────────────────────────
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

// ─── Transactions ─────────────────────────────────────────────────────────────
export function useTransactions(month?: Date) {
  const ref   = month ?? new Date()
  const from  = format(startOfMonth(ref), 'yyyy-MM-dd')
  const to    = format(endOfMonth(ref), 'yyyy-MM-dd')

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const userId = await uid()
    if (!userId) { setLoading(false); return }

    const { data, error: err } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('data', from)
      .lte('data', to)
      .order('data', { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }
    setTransactions(data ?? [])
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  const addTransaction = async (t: Omit<Transaction, 'id' | 'user_id' | 'created_at'>) => {
    const userId = await uid()
    if (!userId) return null
    const { data, error: err } = await supabase
      .from('transactions')
      .insert({ ...t, user_id: userId })
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

  const bulkInsert = async (items: Omit<Transaction, 'id' | 'user_id' | 'created_at'>[]) => {
    const userId = await uid()
    if (!userId) throw new Error('Not authenticated')
    const { error: err } = await supabase
      .from('transactions')
      .insert(items.map(t => ({ ...t, user_id: userId })))
    if (err) throw err
    await load()
  }

  return { transactions, loading, error, refresh: load, addTransaction, deleteTransaction, bulkInsert }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
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

// ─── Category totals (for donut chart) ───────────────────────────────────────
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

// ─── Assets ───────────────────────────────────────────────────────────────────
export function useAssets() {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const userId = await uid()
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    setAssets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addAsset = async (a: Omit<Asset, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const userId = await uid()
    if (!userId) return
    await supabase.from('assets').insert({ ...a, user_id: userId })
    await load()
  }

  const updateAsset = async (id: string, a: Partial<Omit<Asset, 'id' | 'user_id'>>) => {
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

// ─── Plan ─────────────────────────────────────────────────────────────────────
const DEFAULT_PLAN: Omit<UserPlan, 'user_id' | 'updated_at'> = {
  necessidade: 0.5, desejo: 0.3, poupanca: 0.2
}

export function usePlan() {
  const [plan,    setPlan]    = useState<Omit<UserPlan, 'user_id' | 'updated_at'>>(DEFAULT_PLAN)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const userId = await uid()
      if (!userId) { setLoading(false); return }
      const { data } = await supabase
        .from('user_plan').select('*').eq('user_id', userId).maybeSingle()
      if (data) setPlan({ necessidade: Number(data.necessidade), desejo: Number(data.desejo), poupanca: Number(data.poupanca), renda_base: data.renda_base ? Number(data.renda_base) : undefined })
      setLoading(false)
    })()
  }, [])

  const savePlan = async (p: typeof DEFAULT_PLAN) => {
    const userId = await uid()
    if (!userId) return
    await supabase.from('user_plan').upsert({ user_id: userId, ...p })
    setPlan(p)
  }

  return { plan, loading, savePlan }
}

// ─── Notification settings ────────────────────────────────────────────────────
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

// ─── User role ────────────────────────────────────────────────────────────────
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
