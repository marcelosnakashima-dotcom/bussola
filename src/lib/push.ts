import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export type PushSupport = 'unsupported' | 'default' | 'denied' | 'granted'

export function pushSupportState(): PushSupport {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission as PushSupport
}

export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

export async function enablePush(userId: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.register('sw.js')
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('permission-denied')

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })
  }

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint as string,
      p256dh: json.keys?.p256dh as string,
      auth: json.keys?.auth as string,
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
  return sub
}

export async function disablePush(): Promise<void> {
  const sub = await getActiveSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export function listenForSubscriptionRenewal(userId: string) {
  if (!('serviceWorker' in navigator)) return () => {}

  const handler = async (event: MessageEvent) => {
    if (event.data?.type !== 'SUBSCRIPTION_CHANGED') return
    const sub = event.data.subscription
    if (!sub?.endpoint) return
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys?.p256dh,
        auth: sub.keys?.auth,
      },
      { onConflict: 'endpoint' }
    )
  }

  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}
