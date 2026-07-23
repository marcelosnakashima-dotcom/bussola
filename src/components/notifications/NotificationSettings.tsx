import { useEffect, useState, useRef } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNotificationSettings } from '@/hooks/useData'

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad  = '='.repeat((4 - (b64.length % 4)) % 4)
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw  = atob(base)
  const arr  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
}

export function NotificationSettings() {
  const { settings, loading, save, refresh } = useNotificationSettings()
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [activating, setActivating] = useState(false)
  const [msg,        setMsg]        = useState<string | null>(null)

  const iosNotStandalone = isIOS() && !isStandalone()
  const supported = 'Notification' in window && 'serviceWorker' in navigator

  useEffect(() => {
    if (supported) setPermission(Notification.permission)
    navigator.serviceWorker?.addEventListener('message', async e => {
      if (e.data?.type === 'SUBSCRIPTION_CHANGED') await saveSub(e.data.subscription)
    })
  }, [])

  async function saveSub(json: PushSubscriptionJSON) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !json.endpoint || !json.keys) return
    await supabase.from('push_subscriptions').upsert(
      { user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' }
    )
  }

  async function activate() {
    if (iosNotStandalone) {
      setMsg('No iPhone, adicione à Tela de Início pelo Safari e abra pelo ícone.')
      return
    }
    setActivating(true)
    setMsg(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setMsg('Faça login primeiro.'); return }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') { setMsg('Permissão não concedida.'); return }

      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()

      const sub  = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as any,
      })
      await saveSub(sub.toJSON())
      await save(true, settings?.lead_days ?? 3)
      await refresh()
      setMsg('Notificações ativadas ✓')
    } catch (err: any) {
      setMsg(err.message ?? 'Erro ao ativar notificações.')
    } finally {
      setActivating(false)
    }
  }

  if (!supported || loading) return null

  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        {permission === 'granted' && settings?.enabled
          ? <Bell className="w-4 h-4" style={{ color: 'var(--brand)' }} />
          : <BellOff className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        }
        <h3 className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
          Notificações de contas a vencer
        </h3>
      </div>

      {iosNotStandalone && (
        <div className="rounded-lg px-3 py-2 mb-3 text-xs leading-relaxed"
          style={{ background: '#FEF3C7', color: '#92400E' }}>
          Para receber notificações no iPhone, adicione à <strong>Tela de Início</strong> pelo
          Safari (Compartilhar → "Adicionar à Tela de Início") e abra pelo ícone.
        </div>
      )}

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox"
            className="h-4 w-4 flex-shrink-0 accent-brand"
            checked={settings?.enabled ?? false}
            disabled={permission !== 'granted'}
            onChange={e => save(e.target.checked, settings?.lead_days ?? 3)}
          />
          <span style={{ color: 'var(--ink)' }}>Ativar lembretes</span>
        </label>

        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span style={{ color: 'var(--muted)' }} className="whitespace-nowrap">Avisar com</span>
          <input type="number" min={1} max={30}
            value={settings?.lead_days ?? 3}
            disabled={permission !== 'granted'}
            className="w-16 rounded-lg border px-2 py-1 text-center text-sm outline-none"
            style={{ borderColor: 'var(--border)' }}
            onChange={e => save(
              settings?.enabled ?? false,
              Math.min(30, Math.max(1, parseInt(e.target.value) || 1))
            )}
          />
          <span style={{ color: 'var(--muted)' }} className="whitespace-nowrap">dias de antecedência</span>
        </div>

        {permission !== 'granted' && !iosNotStandalone && (
          <button onClick={activate} disabled={activating}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--brand)' }}>
            {activating ? 'Ativando...' : 'Ativar notificações'}
          </button>
        )}

        {permission === 'denied' && (
          <p className="text-xs text-red-600">
            Notificações bloqueadas. Habilite nas configurações do sistema.
          </p>
        )}

        {msg && (
          <p className={`text-xs leading-relaxed ${msg.includes('✓') ? 'text-green-700' : ''}`}
            style={{ color: msg.includes('✓') ? '#15803D' : 'var(--muted)' }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  )
}
