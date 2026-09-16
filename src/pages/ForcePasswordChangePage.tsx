import { useState } from 'react'
import { ShieldCheck, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export function ForcePasswordChangePage() {
  const { signOut } = useAuth()
  const [senha,    setSenha]    = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (senha.length < 8) { setError('A senha precisa ter pelo menos 8 caracteres.'); return }
    if (senha !== confirma) { setError('As senhas não conferem.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({
      password: senha,
      data: { must_change_password: false },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--canvas)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          <span className="font-display text-lg" style={{ color: 'var(--ink)' }}>Defina sua senha</span>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
          Por segurança, defina uma nova senha antes de continuar. Essa é a única vez que isso será pedido.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: 'var(--ink)' }}>Nova senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={8}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: '#fff' }} />
          </div>
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: 'var(--ink)' }}>Confirmar senha</label>
            <input type="password" value={confirma} onChange={e => setConfirma(e.target.value)} required minLength={8}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: '#fff' }} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--brand)' }}>
            {loading ? 'Salvando...' : 'Definir senha e continuar'}
          </button>
        </form>
        <button onClick={signOut} className="flex items-center gap-2 text-sm mt-5 mx-auto" style={{ color: 'var(--muted)' }}>
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </div>
    </div>
  )
}
