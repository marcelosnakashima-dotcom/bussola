import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'user' | 'admin'

// Marca "acabou de entrar": manda cada perfil à sua área logo depois do login (inclusive pelo Google).
export const POS_LOGIN = 'arsen_pos_login'

interface AuthCtx {
  user: User | null
  loading: boolean
  // Papel lido de user_roles. Serve só para a navegação (qual área mostrar): a autorização
  // de verdade é feita no servidor (RLS e funções que conferem user_roles).
  role: Role
  roleLoading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, role: 'user', roleLoading: true, signOut: async () => {} })

export async function fetchRole(userId: string): Promise<Role> {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (error) return 'user'
  return data?.role === 'admin' ? 'admin' : 'user'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role,    setRole]    = useState<Role>('user')
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Recarrega o papel a cada troca de usuário; ao sair, volta a "user" (sem herdar o anterior).
  const userId = user?.id ?? null
  useEffect(() => {
    let vivo = true
    if (!userId) { setRole('user'); setRoleLoading(false); return }
    setRoleLoading(true)
    fetchRole(userId).then(r => { if (vivo) { setRole(r); setRoleLoading(false) } })
    return () => { vivo = false }
  }, [userId])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole('user')
  }

  return <Ctx.Provider value={{ user, loading, role, roleLoading, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
