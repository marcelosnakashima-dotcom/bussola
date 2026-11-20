import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Dados da área do administrador. As funções do banco recusam quem não é admin.
export interface Membro { user_id: string; nome: string; email: string | null; ultimo_acesso: string | null; desde?: string }
export interface ClienteResumo {
  household_id: string
  criado_em: string
  membros: Membro[]
  tem_admin: boolean
  ultimo_acesso: string | null
  lancamentos: number
  ultimo_lancamento: string | null
  ultima_importacao: string | null
  contas: number
  ativos: number
  dividas: number
  receitas_mes: number
  despesas_mes: number
}

export function useAdminClientes() {
  const [clientes, setClientes] = useState<ClienteResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('admin_clientes')
    if (err) { setError(err.message); setLoading(false); return }
    setClientes(((data ?? []) as ClienteResumo[]).map(c => ({
      ...c, lancamentos: Number(c.lancamentos), ativos: Number(c.ativos), dividas: Number(c.dividas),
      receitas_mes: Number(c.receitas_mes), despesas_mes: Number(c.despesas_mes),
    })))
    setError(null)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  return { clientes, loading, error, refresh: load }
}

export interface ClienteDetalhe {
  membros: Membro[]
  serie: { mes: string; receitas: number; despesas: number; necessidade: number; desejo: number; poupanca: number }[]
  categorias_mes: { nome: string; classificacao: 'necessidade' | 'desejo' | 'poupanca' | null; valor: number }[]
  contas: { apelido: string; instituicao: string; tipo: string; final: string | null; ativo: boolean }[]
  importacoes: { fonte: string | null; periodo_inicio: string | null; periodo_fim: string | null; quantidade: number; formato: string | null; created_at: string }[]
  ativos: number
  dividas: number
}

export function useAdminCliente(householdId: string) {
  const [detalhe, setDetalhe] = useState<ClienteDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    setLoading(true)
    supabase.rpc('admin_cliente_detalhe', { p_household: householdId }).then(({ data, error: err }) => {
      if (!vivo) return
      if (err) setError(err.message)
      else setDetalhe(data as ClienteDetalhe)
      setLoading(false)
    })
    return () => { vivo = false }
  }, [householdId])
  return { detalhe, loading, error }
}
