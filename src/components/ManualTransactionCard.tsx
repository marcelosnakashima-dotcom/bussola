import { useState } from 'react'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'
import { useTransactions, useCategories, useAccounts } from '@/hooks/useData'
import { showToast } from '@/components/Toast'

// Lancamento manual de despesa ou receita, opcionalmente vinculado a uma conta.
// Transferencias nao sao lancadas aqui: nascem da importacao e do motor de deteccao.
export function ManualTransactionCard() {
  const { addTransaction } = useTransactions()
  const { categories }     = useCategories()
  const { accounts }       = useAccounts()

  const [open,      setOpen]      = useState(false)
  const [tipo,      setTipo]      = useState<'despesa' | 'receita'>('despesa')
  const [data,      setData]      = useState(format(new Date(), 'yyyy-MM-dd'))
  const [descricao, setDescricao] = useState('')
  const [valor,     setValor]     = useState('')
  const [categoria, setCategoria] = useState('')
  const [accountId, setAccountId] = useState('')
  const [saving,    setSaving]    = useState(false)

  const activeAccounts = accounts.filter(a => a.ativo)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = parseFloat(valor)
    if (!(v > 0)) { showToast('Informe um valor maior que zero.', 'error'); return }
    setSaving(true)
    const created = await addTransaction({
      data,
      descricao: descricao.trim(),
      categoria_id: categoria || null,
      tipo,
      valor: v,
      origem: 'manual',
      status: 'confirmada',
      account_id: accountId || null,
    })
    setSaving(false)
    if (!created) { showToast('Erro ao salvar o lançamento. Tente novamente.', 'error'); return }
    showToast('Lançamento salvo com sucesso!')
    setDescricao(''); setValor(''); setCategoria('')
  }

  const input = 'w-full border rounded-xl px-3 py-2 text-sm'
  const label = 'text-xs mb-1 block'

  return (
    <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left">
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Lançamento manual</span>
        <Plus className={`w-4 h-4 transition-transform ${open ? 'rotate-45' : ''}`} style={{ color: 'var(--muted)' }} />
      </button>
      {open && (
        <form onSubmit={save} className="px-5 pb-5 pt-1 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3">
            <div>
              <label className={label} style={{ color: 'var(--muted)' }}>Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as 'despesa' | 'receita')}
                className={input} style={{ borderColor: 'var(--border)' }}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div>
              <label className={label} style={{ color: 'var(--muted)' }}>Data</label>
              <input type="date" value={data} required onChange={e => setData(e.target.value)}
                className={input} style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--muted)' }}>Valor (R$)</label>
              <input type="number" step="0.01" min="0.01" value={valor} required
                onChange={e => setValor(e.target.value)}
                className={input} style={{ borderColor: 'var(--border)' }} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className={label} style={{ color: 'var(--muted)' }}>Descrição</label>
              <input type="text" value={descricao} required onChange={e => setDescricao(e.target.value)}
                className={input} style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--muted)' }}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className={input} style={{ borderColor: 'var(--border)' }}>
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={label} style={{ color: 'var(--muted)' }}>Conta (opcional)</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}
                className={input} style={{ borderColor: 'var(--border)' }}>
                <option value="">Sem conta</option>
                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.apelido} · {a.instituicao}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--brand)' }}>
            {saving ? 'Salvando...' : 'Salvar lançamento'}
          </button>
        </form>
      )}
    </div>
  )
}
