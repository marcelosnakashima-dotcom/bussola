import { useEffect, useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

// ─── Toast global simples (sem Provider) ──────────────────────────────
// Uso: import { showToast } from '@/components/Toast'
//      showToast('Despesa cadastrada com sucesso!')
//      showToast('Erro ao salvar', 'error')
// Monte <ToastContainer /> uma vez, no AppShell.

type ToastType = 'success' | 'error'
interface ToastItem { id: number; message: string; type: ToastType }

const TOAST_EVENT = 'arsen:toast'
let toastId = 0

export function showToast(message: string, type: ToastType = 'success') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { id: ++toastId, message, type } }))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastItem>).detail
      setToasts(prev => [...prev, detail])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== detail.id))
      }, 3500)
    }
    window.addEventListener(TOAST_EVENT, handler)
    return () => window.removeEventListener(TOAST_EVENT, handler)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-[toast-in_0.2s_ease-out]"
          style={{ background: t.type === 'success' ? 'var(--brand, #2A6049)' : '#DC2626' }}>
          {t.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {t.message}
        </div>
      ))}
    </div>
  )
}
