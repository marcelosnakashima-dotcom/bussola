import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing, LogOut, Mail } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useNotificationSettings } from '@/hooks/useData'
import { enablePush, disablePush, getActiveSubscription, pushSupportState, listenForSubscriptionRenewal } from '@/lib/push'

type PushUiState = 'unsupported' | 'default' | 'denied' | 'granted-off' | 'granted-on'

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const { settings, loading, save } = useNotificationSettings()

  const [enabled, setEnabled]   = useState(true)
  const [leadDays, setLeadDays] = useState(3)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  const [pushState, setPushState] = useState<PushUiState>('default')
  const [pushBusy, setPushBusy]   = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) { setEnabled(settings.enabled); setLeadDays(settings.lead_days) }
  }, [settings])

  useEffect(() => {
    (async () => {
      const support = pushSupportState()
      if (support === 'unsupported' || support === 'denied' || support === 'default') {
        setPushState(support)
        return
      }
      const sub = await getActiveSubscription()
      setPushState(sub ? 'granted-on' : 'granted-off')
    })()
  }, [])

  useEffect(() => {
    if (!user) return
    return listenForSubscriptionRenewal(user.id)
  }, [user])

  const handleSaveSettings = async () => {
    setSaving(true)
    await save(enabled, leadDays)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTogglePush = async () => {
    if (!user) return
    setPushBusy(true)
    setPushError(null)
    try {
      if (pushState === 'granted-on') {
        await disablePush()
        setPushState('granted-off')
      } else {
        await enablePush(user.id)
        setPushState('granted-on')
      }
    } catch (err) {
      if ((err as Error).message === 'permission-denied') {
        setPushState('denied')
        setPushError('Permissão de notificação negada pelo navegador.')
      } else {
        setPushError('Não foi possível ativar as notificações agora.')
      }
    }
    setPushBusy(false)
  }

  return (
    <div className="p-4 md:p-8 max-w-screen-md mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>Perfil</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
          Sua conta e preferências de notificação.
        </p>
      </div>

      {/* Conta */}
      <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0"
            style={{ background: 'var(--brand)' }}>
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate" style={{ color: 'var(--ink)' }}>
              {user?.user_metadata?.full_name ?? user?.email?.split('@')[0]}
            </p>
            <p className="text-xs flex items-center gap-1 truncate" style={{ color: 'var(--muted)' }}>
              <Mail className="w-3 h-3" /> {user?.email}
            </p>
          </div>
        </div>
        <button onClick={signOut}
          className="flex items-center gap-2 text-sm mt-4 pt-4 border-t w-full"
          style={{ borderColor: 'var(--border)', color: '#DC2626' }}>
          <LogOut className="w-4 h-4" /> Sair da conta
        </button>
      </div>

      {/* Notificações */}
      <div className="rounded-2xl border bg-white p-5 space-y-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4" style={{ color: 'var(--brand)' }} />
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>Notificações</h2>
        </div>

        {/* Push neste dispositivo */}
        <div className="rounded-xl p-4" style={{ background: 'var(--canvas)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Push neste dispositivo</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {pushState === 'unsupported' && 'Seu navegador não suporta notificações push.'}
                {pushState === 'denied' && 'Bloqueado nas configurações do navegador.'}
                {pushState === 'default' && 'Ainda não ativado neste dispositivo.'}
                {pushState === 'granted-off' && 'Permissão concedida, mas não ativo aqui.'}
                {pushState === 'granted-on' && 'Ativo — você vai receber avisos aqui.'}
              </p>
            </div>
            {(pushState === 'default' || pushState === 'granted-off' || pushState === 'granted-on') && (
              <button onClick={handleTogglePush} disabled={pushBusy}
                className="px-3 py-2 rounded-lg text-xs font-medium text-white whitespace-nowrap disabled:opacity-60 flex items-center gap-1.5"
                style={{ background: pushState === 'granted-on' ? '#DC2626' : 'var(--brand)' }}>
                {pushState === 'granted-on' ? <BellOff className="w-3.5 h-3.5" /> : <BellRing className="w-3.5 h-3.5" />}
                {pushBusy ? '...' : pushState === 'granted-on' ? 'Desativar' : 'Ativar'}
              </button>
            )}
          </div>
          {pushError && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{pushError}</p>}
        </div>

        {/* Avisos de contas a vencer */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Avisos de contas a vencer</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Receba um alerta antes do vencimento das suas despesas recorrentes.
            </p>
          </div>
          <button role="switch" aria-checked={enabled} onClick={() => setEnabled(v => !v)}
            className="w-11 h-6 rounded-full relative transition-colors flex-shrink-0"
            style={{ background: enabled ? 'var(--brand)' : 'var(--border)' }}>
            <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0)' }} />
          </button>
        </div>

        <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
          <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
            Avisar com quantos dias de antecedência (1 a 30)
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => setLeadDays(d => Math.max(1, d - 1))}
              className="w-8 h-8 rounded-lg border flex items-center justify-center text-lg"
              style={{ borderColor: 'var(--border)' }}>−</button>
            <span className="font-display text-xl w-10 text-center" style={{ color: 'var(--brand)' }}>
              {leadDays}
            </span>
            <button onClick={() => setLeadDays(d => Math.min(30, d + 1))}
              className="w-8 h-8 rounded-lg border flex items-center justify-center text-lg"
              style={{ borderColor: 'var(--border)' }}>+</button>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>dia(s)</span>
          </div>
        </div>

        <button onClick={handleSaveSettings} disabled={saving || loading}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--brand)' }}>
          {saving ? 'Salvando...' : saved ? 'Salvo ✓' : 'Salvar preferências'}
        </button>
      </div>
    </div>
  )
}
