import { useState } from 'react'
import { useSummary, usePlan } from '@/hooks/useData'
import { formatBRL } from '@/lib/supabase'

const CLASSES = [
  { key: 'necessidade' as const, label: 'Necessidades', desc: 'Moradia, transporte, saúde, alimentação básica', color: '#2A6049', default: 50 },
  { key: 'desejo'      as const, label: 'Desejos',      desc: 'Lazer, restaurantes, assinaturas, roupas',     color: '#D97706', default: 30 },
  { key: 'poupanca'   as const, label: 'Poupança',      desc: 'Reserva de emergência, investimentos',         color: '#2563EB', default: 20 },
]

export function GoalsPage() {
  const { summary, loading } = useSummary()
  const { plan, savePlan }   = usePlan()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState<{ necessidade: number; desejo: number; poupanca: number } | null>(null)
  const [rendaInput, setRendaInput] = useState('')

  const startEdit = () => {
    setDraft({
      necessidade: Math.round((plan.necessidade) * 100),
      desejo:      Math.round((plan.desejo)      * 100),
      poupanca:   Math.round((plan.poupanca)    * 100),
    })
    setRendaInput(plan.renda_base?.toString() ?? '')
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!draft) return
    const total = draft.necessidade + draft.desejo + draft.poupanca
    if (total !== 100) return
    await savePlan({
      necessidade: draft.necessidade / 100,
      desejo:      draft.desejo / 100,
      poupanca:   draft.poupanca / 100,
      renda_base: rendaInput ? parseFloat(rendaInput) : undefined,
    })
    setEditing(false)
  }

  return (
    <div className="p-4 md:p-8 max-w-screen-md mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
            Metas 50/30/20
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Distribua sua renda com equilíbrio.
          </p>
        </div>
        <button onClick={editing ? saveEdit : startEdit}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--brand)' }}>
          {editing ? 'Salvar metas' : 'Ajustar metas'}
        </button>
      </div>

      {/* Renda base */}
      {editing && (
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
          <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
            Renda base mensal (R$) — deixe vazio para usar o total de receitas do mês
          </label>
          <input type="number" step="100" min="0" value={rendaInput}
            onChange={e => setRendaInput(e.target.value)}
            placeholder="Ex: 12000"
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: 'var(--border)' }} />
        </div>
      )}

      {/* Classes */}
      {CLASSES.map(cl => {
        const classData = summary?.classes.find(c => c.classificacao === cl.key)
        const pct       = editing ? (draft?.[cl.key] ?? 0) : Math.round(plan[cl.key] * 100)
        const total     = classData?.total ?? 0
        const meta      = classData?.meta  ?? 0
        const over      = total > meta
        const pctUsed   = meta > 0 ? Math.min(total / meta, 1) : 0

        return (
          <div key={cl.key} className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)', borderLeft: `4px solid ${cl.color}` }}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-medium" style={{ color: 'var(--ink)' }}>{cl.label}</h3>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{cl.desc}</p>
              </div>
              <div className="text-right">
                {editing && draft
                  ? <div className="flex items-center gap-1">
                      <button onClick={() => setDraft(d => d ? { ...d, [cl.key]: Math.max(0, d[cl.key] - 5) } : d)}
                        className="w-7 h-7 rounded-lg border flex items-center justify-center text-lg"
                        style={{ borderColor: 'var(--border)' }}>−</button>
                      <span className="font-display text-2xl w-12 text-center" style={{ color: cl.color }}>
                        {draft[cl.key]}%
                      </span>
                      <button onClick={() => setDraft(d => d ? { ...d, [cl.key]: Math.min(100, d[cl.key] + 5) } : d)}
                        className="w-7 h-7 rounded-lg border flex items-center justify-center text-lg"
                        style={{ borderColor: 'var(--border)' }}>+</button>
                    </div>
                  : <p className="font-display text-3xl" style={{ color: cl.color }}>{pct}%</p>
                }
              </div>
            </div>

            {!loading && !editing && (
              <div className="mt-3 space-y-1.5">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pctUsed * 100}%`, background: over ? '#DC2626' : cl.color }} />
                </div>
                <div className="flex justify-between text-xs font-mono" style={{ color: 'var(--muted)' }}>
                  <span>{formatBRL(total)} gastos</span>
                  <span className={over ? 'text-red-600 font-medium' : ''}>
                    meta {formatBRL(meta)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {editing && draft && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium text-center ${
          draft.necessidade + draft.desejo + draft.poupanca === 100 ? 'text-green-700' : 'text-red-600'
        }`} style={{
          background: draft.necessidade + draft.desejo + draft.poupanca === 100 ? '#DCFCE7' : '#FEE2E2'
        }}>
          Total: {draft.necessidade + draft.desejo + draft.poupanca}%
          {draft.necessidade + draft.desejo + draft.poupanca !== 100
            ? ' — deve somar 100%'
            : ' ✓'}
        </div>
      )}
    </div>
  )
}
