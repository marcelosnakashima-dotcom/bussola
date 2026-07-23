import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'admin'

export interface Category {
  id: string
  nome: string
  classificacao: 'necessidade' | 'desejo' | 'poupanca'
  padrao: boolean
}

export interface Transaction {
  id: string
  user_id: string
  data: string
  descricao: string
  categoria_id: string | null
  tipo: 'despesa' | 'receita'
  valor: number
  origem: 'manual' | 'pdf'
  status: 'pendente' | 'confirmada'
  confianca?: 'alta' | 'media' | 'revisar'
  created_at: string
}

export interface Asset {
  id: string
  user_id: string
  tipo: 'reserva' | 'consorcio' | 'previdencia' | 'seguro' | 'investimento' | 'imovel' | 'outro'
  nome: string
  valor: number
  detalhe?: string
  created_at: string
  updated_at: string
}

export interface UserPlan {
  user_id: string
  necessidade: number
  desejo: number
  poupanca: number
  renda_base?: number
  updated_at: string
}

export interface NotificationSettings {
  id: string
  user_id: string
  enabled: boolean
  lead_days: number
  created_at: string
  updated_at: string
}

export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

export interface NotificationTemplate {
  id: string
  title: string
  body: string
  category: 'bill_reminder' | 'tip' | 'goal' | 'alert' | 'custom'
  icon: string
  active: boolean
  trigger_type: 'manual' | 'scheduled' | 'cron_daily'
  created_by?: string
  created_at: string
  updated_at: string
}

export interface AdminNotification {
  id: string
  template_id?: string
  title_override?: string
  body_override?: string
  target_user_id?: string
  send_at: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  sent_at?: string
  total_sent: number
  error_message?: string
  created_by?: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export const currentUserId = async () => {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}
