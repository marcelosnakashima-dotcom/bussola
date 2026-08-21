import { useState } from 'react'
import { Compass } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function AuthPage() {
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (err) throw err
    } catch (err: any) {
      setError(err.message ?? 'Erro ao autenticar.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: 'var(--canvas)' }}>
      {/* Logo — canto superior direito */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <Compass className="w-5 h-5" style={{ color: 'var(--brand)' }} />
        <span className="font-display text-lg" style={{ color: 'var(--ink)' }}>Bússola</span>
      </div>

      <div className="w-full max-w-sm">
        <h2 className="font-display text-2xl mb-6" style={{ color: 'var(--ink)' }}>
          Entrar
        </h2>

        {/* Google */}
        <button onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border text-sm font-medium transition-colors hover:bg-gray-50 mb-4"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar com Google
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div className="relative flex justify-center text-xs px-2 bg-canvas" style={{ color: 'var(--muted)' }}>
            ou com e-mail
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: 'var(--ink)' }}>
                E-mail
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-brand/20 transition-shadow"
              style={{ borderColor: 'var(--border)', background: '#fff' }} />
          </div>
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: 'var(--ink)' }}>
              Senha
            </label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-brand/20 transition-shadow"
              style={{ borderColor: 'var(--border)', background: '#fff' }} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--brand)' }}>
            {loading ? 'Aguarde...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
