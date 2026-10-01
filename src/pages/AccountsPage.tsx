import { useState } from 'react'
import { Plus, Pencil, Landmark, Power } from 'lucide-react'
import { useAccounts, type AccountInput } from '@/hooks/useData'
import { showToast } from '@/components/Toast'
import type { Account, AccountTipo } from '@/lib/supabase'

const TIPO_LABELS: Record<AccountTipo, string> = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  investimento: 'Investimento',
  cartao: 'Cartão de crédito',
  outro: 'Outro',
}

function AccountForm({
  initial, onSave, onCancel
}: {
  initial?: Partial<Account>
  onSave: (a: AccountInput) => Promise<void>
  onCancel: () => void
}) {
  const [instituicao, setInstituicao] = useState(initial?.instituicao ?? '')
  const [apelido,     setApelido]     = useState(initial?.apelido ?? '')
  const [tipo,        setTipo]        = useState<AccountTipo>(initial?.tipo ?? 'corrente')
  const [final,       setFinal]       = useState(initial?.final ?? '')
  const [saving,      setSaving]      = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave({
      instituicao: instituicao.trim(),
      apelido: apelido.trim(),
      tipo,
      final: final.trim() || null,
    })
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Instituição</label>
          <input type="text" value={instituicao} required placeholder="Ex.: Nubank"
            onChange={e => setInstituicao(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Apelido</label>
          <input type="text" value={apelido} required placeholder="Ex.: Conta principal"
            onChange={e => setApelido(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value as AccountTipo)}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Final (3 a 6 dígitos, opcional)</label>
          <input type="text" inputMode="numeric" pattern="[0-9]{3,6}" maxLength={6} value={final}
            title="Entre 3 e 6 dígitos"
            onChange={e => setFinal(e.target.value.replace(/\D/g, ''))}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--brand)' }}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm border" style={{ borderColor: 'var(--border)' }}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function AccountsPage() {
  const { accounts, loading, error, addAccount, updateAccount } = useAccounts()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const active   = accounts.filter(a => a.ativo)
  const inactive = accounts.filter(a => !a.ativo)

  const toggleAtivo = async (a: Account) => {
    setBusy(a.id)
    try {
      await updateAccount(a.id, { ativo: !a.ativo })
      showToast(a.ativo ? 'Conta desativada.' : 'Conta reativada.')
    } catch {
      showToast('Erro ao atualizar a conta. Tente novamente.', 'error')
    }
    setBusy(null)
  }

  const renderCard = (a: Account) => (
    <div key={a.id}>
      {editing?.id === a.id
        ? <div className="rounded-2xl border bg-white p-4 col-span-full" style={{ borderColor: 'var(--border)' }}>
            <AccountForm
              initial={a}
              onSave={async upd => {
                try {
                  await updateAccount(a.id, upd)
                  setEditing(null)
                  showToast('Conta atualizada com sucesso!')
                } catch {
                  showToast('Erro ao atualizar a conta. Tente novamente.', 'error')
                }
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        : <div className="rounded-2xl border bg-white p-4 relative group"
            style={{ borderColor: 'var(--border)', opacity: a.ativo ? 1 : 0.6 }}>
            <div className="absolute top-3 right-3 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(a)} aria-label="Editar conta" className="p-1.5 rounded-lg hover:bg-gray-100">
                <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
              </button>
              <button onClick={() => toggleAtivo(a)} disabled={busy === a.id}
                aria-label={a.ativo ? 'Desativar conta' : 'Reativar conta'}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50">
                <Power className="w-3.5 h-3.5" style={{ color: a.ativo ? '#DC2626' : 'var(--brand)' }} />
              </button>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
              {TIPO_LABELS[a.tipo]}
            </p>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{a.apelido}</p>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--muted)' }}>
              {a.instituicao}{a.final ? ` · final ${a.final}` : ''}
            </p>
          </div>
      }
    </div>
  )

  return (
    <div className="p-4 md:p-8 max-w-screen-lg mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
            Contas e cartões
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Cadastre onde seu dinheiro circula para identificarmos transferências entre contas.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shrink-0"
          style={{ background: 'var(--brand)' }}>
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: '#FCA5A5', color: '#B91C1C' }}>
          Não foi possível carregar as contas: {error}
        </div>
      )}

      {showAdd && (
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-medium mb-4" style={{ color: 'var(--ink)' }}>Nova conta ou cartão</h3>
          <AccountForm
            onSave={async a => {
              try {
                await addAccount(a)
                setShowAdd(false)
                showToast('Conta cadastrada com sucesso!')
              } catch {
                showToast('Erro ao cadastrar a conta. Tente novamente.', 'error')
              }
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {loading
        ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border p-5 h-24 animate-pulse"
                style={{ borderColor: 'var(--border)', background: '#f5f5f5' }} />
            ))}
          </div>
        : accounts.length === 0 && !showAdd
        ? <div className="rounded-2xl border bg-white p-12 text-center" style={{ borderColor: 'var(--border)' }}>
            <Landmark className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--border)' }} />
            <p className="font-medium mb-1" style={{ color: 'var(--ink)' }}>Nenhuma conta cadastrada</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Comece pelas contas correntes e cartões de crédito do casal.
            </p>
            <button onClick={() => setShowAdd(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--brand)' }}>
              Adicionar primeira conta
            </button>
          </div>
        : <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {active.map(renderCard)}
            </div>
            {inactive.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-mono tracking-widest" style={{ color: 'var(--muted)' }}>DESATIVADAS</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {inactive.map(renderCard)}
                </div>
              </div>
            )}
          </>
      }
    </div>
  )
}
