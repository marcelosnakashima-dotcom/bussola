import { useState } from 'react'
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react'
import { useAssets } from '@/hooks/useData'
import { formatBRL, type Asset } from '@/lib/supabase'

const TIPO_LABELS: Record<Asset['tipo'], string> = {
  reserva: 'Reserva', consorcio: 'Consórcio', previdencia: 'Previdência',
  seguro: 'Seguro', investimento: 'Investimento', imovel: 'Imóvel', outro: 'Outro',
}

function AssetForm({
  initial, onSave, onCancel
}: {
  initial?: Partial<Asset>
  onSave: (a: Omit<Asset, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
}) {
  const [tipo,    setTipo]    = useState<Asset['tipo']>(initial?.tipo ?? 'investimento')
  const [nome,    setNome]    = useState(initial?.nome ?? '')
  const [valor,   setValor]   = useState(initial?.valor?.toString() ?? '')
  const [detalhe, setDetalhe] = useState(initial?.detalhe ?? '')
  const [saving,  setSaving]  = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave({ tipo, nome, valor: parseFloat(valor), detalhe: detalhe || undefined })
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value as Asset['tipo'])}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Valor (R$)</label>
          <input type="number" step="0.01" min="0" value={valor} required
            onChange={e => setValor(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
        </div>
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Nome</label>
        <input type="text" value={nome} required onChange={e => setNome(e.target.value)}
          className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Detalhe (opcional)</label>
        <input type="text" value={detalhe} onChange={e => setDetalhe(e.target.value)}
          className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
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

export function AssetsPage() {
  const { assets, loading, total, addAsset, updateAsset, deleteAsset } = useAssets()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  return (
    <div className="p-4 md:p-8 max-w-screen-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
            Ativos e patrimônio
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Tudo que compõe sua proteção e seu futuro.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--brand)' }}>
          <Plus className="w-4 h-4" /> Adicionar ativo
        </button>
      </div>

      {/* Total */}
      <div className="rounded-2xl border bg-white p-6" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[10px] font-mono tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
          PATRIMÔNIO TOTAL
        </p>
        {loading
          ? <div className="h-9 w-48 rounded animate-pulse" style={{ background: 'var(--border)' }} />
          : <p className="font-display text-3xl" style={{ color: 'var(--ink)' }}>{formatBRL(total)}</p>
        }
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          {assets.length} ativo{assets.length !== 1 ? 's' : ''} cadastrado{assets.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-medium mb-4" style={{ color: 'var(--ink)' }}>Novo ativo</h3>
          <AssetForm
            onSave={async a => { await addAsset(a); setShowAdd(false) }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* Assets grid */}
      {loading
        ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-white p-5 h-32 animate-pulse"
                style={{ borderColor: 'var(--border)', background: '#f5f5f5' }} />
            ))}
          </div>
        : assets.length === 0 && !showAdd
        ? <div className="rounded-2xl border bg-white p-12 text-center" style={{ borderColor: 'var(--border)' }}>
            <Wallet className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--border)' }} />
            <p className="font-medium mb-1" style={{ color: 'var(--ink)' }}>Nenhum ativo cadastrado</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Adicione sua reserva de emergência, investimentos e outros ativos.
            </p>
            <button onClick={() => setShowAdd(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--brand)' }}>
              Adicionar primeiro ativo
            </button>
          </div>
        : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {assets.map(a => (
              <div key={a.id}>
                {editing?.id === a.id
                  ? <div className="rounded-2xl border bg-white p-4 col-span-2" style={{ borderColor: 'var(--border)' }}>
                      <AssetForm
                        initial={a}
                        onSave={async upd => { await updateAsset(a.id, upd); setEditing(null) }}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  : <div className="rounded-2xl border bg-white p-4 relative group" style={{ borderColor: 'var(--border)' }}>
                      {/* Actions */}
                      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditing(a)}
                          className="p-1.5 rounded-lg hover:bg-gray-100">
                          <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                        </button>
                        <button onClick={async () => {
                          setDeleting(a.id)
                          await deleteAsset(a.id)
                          setDeleting(null)
                        }}
                          className="p-1.5 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                      <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
                        {TIPO_LABELS[a.tipo]}
                      </p>
                      <p className="text-sm font-medium truncate mb-2" style={{ color: 'var(--ink)' }}>{a.nome}</p>
                      <p className="font-display text-xl" style={{ color: 'var(--ink)' }}>{formatBRL(a.valor)}</p>
                      {a.detalhe && (
                        <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--muted)' }}>{a.detalhe}</p>
                      )}
                      {deleting === a.id && (
                        <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.8)' }}>
                          <div className="w-5 h-5 rounded-full border-2 animate-spin"
                            style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
                        </div>
                      )}
                    </div>
                }
              </div>
            ))}
          </div>
      }
    </div>
  )
}
