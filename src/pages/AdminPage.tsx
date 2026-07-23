import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Send, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUserRole } from '@/hooks/useData'
import { formatDate } from '@/lib/supabase'
import type { NotificationTemplate, AdminNotification } from '@/lib/supabase'

const CATEGORIES = [
  { value: 'bill_reminder', label: '💰 Lembrete de conta' },
  { value: 'tip',           label: '💡 Dica financeira' },
  { value: 'goal',          label: '🎯 Meta atingida' },
  { value: 'alert',         label: '⚠️ Alerta' },
  { value: 'custom',        label: '✏️ Personalizado' },
]

const TRIGGERS = [
  { value: 'manual',    label: 'Manual (disparo único)' },
  { value: 'scheduled', label: 'Agendado (data/hora)' },
  { value: 'cron_daily',label: 'Cron diário (automático)' },
]

const STATUS_ICON = {
  pending:   <Clock className="w-4 h-4 text-amber-500" />,
  sent:      <CheckCircle className="w-4 h-4 text-green-600" />,
  failed:    <XCircle className="w-4 h-4 text-red-500" />,
  cancelled: <XCircle className="w-4 h-4 text-gray-400" />,
}

function TemplateForm({
  initial, onSave, onCancel
}: {
  initial?: Partial<NotificationTemplate>
  onSave: (t: Partial<NotificationTemplate>) => Promise<void>
  onCancel: () => void
}) {
  const [title,   setTitle]   = useState(initial?.title ?? '')
  const [body,    setBody]    = useState(initial?.body ?? '')
  const [icon,    setIcon]    = useState(initial?.icon ?? '🔔')
  const [cat,     setCat]     = useState<string>(initial?.category ?? 'custom')
  const [trigger, setTrigger] = useState<string>(initial?.trigger_type ?? 'manual')
  const [active,  setActive]  = useState(initial?.active ?? true)
  const [saving,  setSaving]  = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    await onSave({ title, body, icon, category: cat as any, trigger_type: trigger as any, active })
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="grid grid-cols-5 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Ícone</label>
          <input type="text" value={icon} onChange={e => setIcon(e.target.value)} maxLength={2}
            className="w-full border rounded-xl px-3 py-2 text-center text-xl" style={{ borderColor: 'var(--border)' }} />
        </div>
        <div className="col-span-4">
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Título</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
        </div>
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
          Corpo — use {'{descricao}'}, {'{valor}'}, {'{data}'} como variáveis
        </label>
        <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} required
          className="w-full border rounded-xl px-3 py-2 text-sm resize-none" style={{ borderColor: 'var(--border)' }} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
          <select value={cat} onChange={e => setCat(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Gatilho</label>
          <select value={trigger} onChange={e => setTrigger(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
            {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4" />
        <span style={{ color: 'var(--ink)' }}>Template ativo</span>
      </label>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--brand)' }}>
          {saving ? 'Salvando...' : 'Salvar template'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm border" style={{ borderColor: 'var(--border)' }}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function AdminPage() {
  const { isAdmin, loading: roleLoading } = useUserRole()
  const [tab,      setTab]      = useState<'templates' | 'disparos'>('templates')
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [dispatches, setDispatches] = useState<AdminNotification[]>([])
  const [showAddTmpl, setShowAddTmpl] = useState(false)
  const [editTmpl,    setEditTmpl]    = useState<NotificationTemplate | null>(null)
  const [showDispatch, setShowDispatch] = useState(false)
  const [dispatchForm, setDispatchForm] = useState({ templateId: '', titleOverride: '', bodyOverride: '', targetAll: true, sendNow: true, sendAt: '' })
  const [dispatching, setDispatching] = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)

  const loadTemplates = async () => {
    const { data } = await supabase.from('notification_templates').select('*').order('created_at')
    setTemplates(data ?? [])
  }

  const loadDispatches = async () => {
    const { data } = await supabase.from('admin_notifications').select('*, notification_templates(title)').order('created_at', { ascending: false }).limit(50)
    setDispatches(data ?? [])
  }

  useEffect(() => { loadTemplates(); loadDispatches() }, [])

  const saveTemplate = async (t: Partial<NotificationTemplate>) => {
    if (editTmpl) {
      await supabase.from('notification_templates').update(t).eq('id', editTmpl.id)
      setEditTmpl(null)
    } else {
      await supabase.from('notification_templates').insert(t)
      setShowAddTmpl(false)
    }
    await loadTemplates()
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Excluir este template?')) return
    await supabase.from('notification_templates').delete().eq('id', id)
    await loadTemplates()
  }

  const dispatchNow = async () => {
    setDispatching(true)
    try {
      // 1. Cria registro admin_notification
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('admin_notifications').insert({
        template_id:    dispatchForm.templateId || null,
        title_override: dispatchForm.titleOverride || null,
        body_override:  dispatchForm.bodyOverride  || null,
        target_user_id: dispatchForm.targetAll ? null : undefined,
        send_at:        dispatchForm.sendNow ? new Date().toISOString() : dispatchForm.sendAt,
        status:         'pending',
        created_by:     user?.id,
      })

      // 2. Se envio imediato, chama a Edge Function
      if (dispatchForm.sendNow) {
        const supaUrl = import.meta.env.VITE_SUPABASE_URL
        await fetch(`${supaUrl}/functions/v1/send-due-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': import.meta.env.VITE_CRON_SECRET ?? '' },
          body: '{}',
        })
      }

      setShowDispatch(false)
      setDispatchForm({ templateId: '', titleOverride: '', bodyOverride: '', targetAll: true, sendNow: true, sendAt: '' })
      await loadDispatches()
    } finally {
      setDispatching(false)
    }
  }

  const refreshDispatches = async () => {
    setRefreshing(true)
    await loadDispatches()
    setRefreshing(false)
  }

  if (roleLoading) return <div className="p-8 flex justify-center">
    <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
  </div>

  if (!isAdmin) return <div className="p-8 text-center">
    <p className="font-display text-xl mb-2" style={{ color: 'var(--ink)' }}>Acesso restrito</p>
    <p style={{ color: 'var(--muted)' }}>Esta área é exclusiva para administradores.</p>
  </div>

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>Administração</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>Gerencie templates e disparos de notificação.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['templates', 'disparos'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-brand' : 'border-transparent'}`}
            style={{ color: tab === t ? 'var(--brand)' : 'var(--muted)', borderColor: tab === t ? 'var(--brand)' : 'transparent' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Templates */}
      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddTmpl(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--brand)' }}>
              <Plus className="w-4 h-4" /> Novo template
            </button>
          </div>

          {showAddTmpl && (
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-medium mb-4" style={{ color: 'var(--ink)' }}>Novo template</h3>
              <TemplateForm onSave={saveTemplate} onCancel={() => setShowAddTmpl(false)} />
            </div>
          )}

          <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {templates.length === 0
              ? <div className="p-10 text-center text-sm" style={{ color: 'var(--muted)' }}>Nenhum template cadastrado.</div>
              : <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)', background: '#FAFAF8' }}>
                      <th className="px-5 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>TEMPLATE</th>
                      <th className="px-5 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>CATEGORIA</th>
                      <th className="px-5 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>GATILHO</th>
                      <th className="px-5 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>STATUS</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(t => (
                      <>
                        {editTmpl?.id === t.id ? (
                          <tr key={t.id}>
                            <td colSpan={5} className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                              <TemplateForm initial={t} onSave={saveTemplate} onCancel={() => setEditTmpl(null)} />
                            </td>
                          </tr>
                        ) : (
                          <tr key={t.id} className="border-b hover:bg-gray-50 transition-colors" style={{ borderColor: 'var(--border)' }}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{t.icon}</span>
                                <div>
                                  <p className="font-medium" style={{ color: 'var(--ink)' }}>{t.title}</p>
                                  <p className="text-xs truncate max-w-xs" style={{ color: 'var(--muted)' }}>{t.body}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                              {CATEGORIES.find(c => c.value === t.category)?.label ?? t.category}
                            </td>
                            <td className="px-5 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                              {TRIGGERS.find(tr => tr.value === t.trigger_type)?.label ?? t.trigger_type}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${t.active ? 'text-green-700' : 'text-gray-500'}`}
                                style={{ background: t.active ? '#DCFCE7' : '#F3F4F6' }}>
                                {t.active ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => setEditTmpl(t)} className="p-1.5 rounded-lg hover:bg-gray-100">
                                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                                </button>
                                <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded-lg hover:bg-red-50">
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        </div>
      )}

      {/* Disparos */}
      {tab === 'disparos' && (
        <div className="space-y-4">
          <div className="flex gap-2 justify-end">
            <button onClick={refreshDispatches} className="p-2.5 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} style={{ color: 'var(--muted)' }} />
            </button>
            <button onClick={() => setShowDispatch(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--brand)' }}>
              <Send className="w-4 h-4" /> Novo disparo
            </button>
          </div>

          {showDispatch && (
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-medium mb-4" style={{ color: 'var(--ink)' }}>Novo disparo</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Template base</label>
                  <select value={dispatchForm.templateId} onChange={e => setDispatchForm({ ...dispatchForm, templateId: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                    <option value="">Nenhum (texto livre)</option>
                    {templates.filter(t => t.active).map(t => (
                      <option key={t.id} value={t.id}>{t.icon} {t.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Título (override opcional)</label>
                  <input type="text" value={dispatchForm.titleOverride} onChange={e => setDispatchForm({ ...dispatchForm, titleOverride: e.target.value })}
                    placeholder="Deixe vazio para usar o do template"
                    className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Mensagem (override opcional)</label>
                  <textarea rows={2} value={dispatchForm.bodyOverride} onChange={e => setDispatchForm({ ...dispatchForm, bodyOverride: e.target.value })}
                    placeholder="Deixe vazio para usar o do template"
                    className="w-full border rounded-xl px-3 py-2 text-sm resize-none" style={{ borderColor: 'var(--border)' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Quando enviar</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="when" checked={dispatchForm.sendNow} onChange={() => setDispatchForm({ ...dispatchForm, sendNow: true })} />
                      Agora
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="when" checked={!dispatchForm.sendNow} onChange={() => setDispatchForm({ ...dispatchForm, sendNow: false })} />
                      Agendar
                    </label>
                  </div>
                  {!dispatchForm.sendNow && (
                    <input type="datetime-local" value={dispatchForm.sendAt} onChange={e => setDispatchForm({ ...dispatchForm, sendAt: e.target.value })}
                      className="mt-2 w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={dispatchNow} disabled={dispatching}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: 'var(--brand)' }}>
                    <Send className="w-4 h-4" />
                    {dispatching ? 'Enviando...' : dispatchForm.sendNow ? 'Disparar agora' : 'Agendar disparo'}
                  </button>
                  <button onClick={() => setShowDispatch(false)}
                    className="px-4 py-2.5 rounded-xl text-sm border" style={{ borderColor: 'var(--border)' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {dispatches.length === 0
              ? <div className="p-10 text-center text-sm" style={{ color: 'var(--muted)' }}>Nenhum disparo realizado ainda.</div>
              : <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)', background: '#FAFAF8' }}>
                      <th className="px-5 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>STATUS</th>
                      <th className="px-5 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>TEMPLATE</th>
                      <th className="px-5 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>AGENDADO PARA</th>
                      <th className="px-5 py-3 text-right text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>ENVIADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatches.map(d => (
                      <tr key={d.id} className="border-b hover:bg-gray-50" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {STATUS_ICON[d.status]}
                            <span className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{d.status}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium" style={{ color: 'var(--ink)' }}>
                            {d.title_override ?? (d as any).notification_templates?.title ?? '—'}
                          </p>
                          {d.body_override && (
                            <p className="text-xs truncate max-w-xs" style={{ color: 'var(--muted)' }}>{d.body_override}</p>
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--muted)' }}>
                          {formatDate(d.send_at.slice(0, 10))} {d.send_at.slice(11, 16)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: 'var(--muted)' }}>
                          {d.total_sent} dispositivo{d.total_sent !== 1 ? 's' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        </div>
      )}
    </div>
  )
}
