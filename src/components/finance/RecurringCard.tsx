import { useState } from 'react'
import { Check, Pencil, Repeat, X } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { useRecurringExpenses } from '@/hooks/useData'
import { brl } from '@/lib/format'

// Despesas recorrentes (consórcios, financiamentos, assinaturas): editar e remover, como antes.
export function RecurringCard() {
  const { expenses, loading, deactivate, update } = useRecurringExpenses()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ description: string; category: string; amount: number | ''; due_day: number | '' }>({ description: '', category: '', amount: '', due_day: '' })
  const [confirmar, setConfirmar] = useState<string | null>(null)

  if (loading || expenses.length === 0) return null
  const hoje = new Date().getDate()
  const ordenadas = [...expenses].sort((a, b) => ((a.due_day - hoje + 31) % 31) - ((b.due_day - hoje + 31) % 31))
  const input = 'w-full border border-line rounded-lg px-2.5 py-1.5 text-sm bg-surface text-ink'

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Repeat className="w-4 h-4 text-brand" /> Despesas recorrentes</span>}
        subtitle="Cobranças automáticas, na ordem do próximo vencimento" />
      <ul className="divide-y divide-[var(--border)]">
        {ordenadas.map(e => editingId === e.id ? (
          <li key={e.id} className="py-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted">Descrição
                <input className={input} value={form.description} onChange={ev => setForm(p => ({ ...p, description: ev.target.value }))} /></label>
              <label className="text-[11px] text-muted">Categoria
                <input className={input} value={form.category} onChange={ev => setForm(p => ({ ...p, category: ev.target.value }))} /></label>
              <label className="text-[11px] text-muted">Valor
                <input className={`${input} num`} inputMode="numeric" placeholder="R$ 0,00"
                  value={form.amount === '' ? '' : brl(Number(form.amount))}
                  onChange={ev => { const d = ev.target.value.replace(/\D/g, ''); setForm(p => ({ ...p, amount: d ? parseInt(d, 10) / 100 : '' })) }} /></label>
              <label className="text-[11px] text-muted">Dia do vencimento
                <input className={input} type="number" min={1} max={31} value={form.due_day}
                  onChange={ev => setForm(p => ({ ...p, due_day: ev.target.value === '' ? '' : Number(ev.target.value) }))} /></label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={async () => {
                await update(e.id, {
                  description: form.description || 'Despesa recorrente',
                  category: form.category || null,
                  amount: form.amount === '' ? 0 : Number(form.amount),
                  due_day: form.due_day === '' ? 1 : Math.min(31, Math.max(1, Number(form.due_day))),
                })
                setEditingId(null)
              }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--brand)' }}>
                <Check className="w-3.5 h-3.5" /> Salvar
              </button>
              <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg text-xs border border-line">Cancelar</button>
            </div>
          </li>
        ) : (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 bg-surface-2">
                <span className="text-[9px] uppercase text-muted leading-none">dia</span>
                <span className="num text-sm font-semibold text-ink leading-none mt-0.5">{e.due_day}</span>
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{e.description}</p>
                <p className="text-[11px] text-muted truncate">{e.category ?? 'Sem categoria'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="num text-sm font-medium text-ink mr-1">{brl(Number(e.amount))}</span>
              {confirmar === e.id ? (
                <>
                  <button onClick={() => { deactivate(e.id); setConfirmar(null) }} className="text-xs font-medium px-2 py-1 rounded-lg" style={{ color: 'var(--danger)' }}>Remover</button>
                  <button onClick={() => setConfirmar(null)} className="text-xs px-2 py-1 rounded-lg text-muted">Não</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingId(e.id); setForm({ description: e.description, category: e.category ?? '', amount: Number(e.amount), due_day: e.due_day }) }}
                    title="Editar" aria-label={`Editar ${e.description}`} className="p-1.5 rounded-lg hover:bg-surface-2"><Pencil className="w-3.5 h-3.5 text-muted" /></button>
                  <button onClick={() => setConfirmar(e.id)} title="Remover" aria-label={`Remover ${e.description}`}
                    className="p-1.5 rounded-lg hover:bg-surface-2"><X className="w-3.5 h-3.5 text-muted" /></button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
