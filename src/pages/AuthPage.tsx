import { useState } from 'react'
import { Compass } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function AuthPage() {
  const [mode,    setMode]    = useState<'login' | 'signup'>('login')
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [info,    setInfo]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (err) throw err
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password: pass })
        if (err) throw err
        setInfo('Verifique seu e-mail para confirmar o cadastro.')
      }
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
    <div className="min-h-screen flex" style={{ background: 'var(--canvas)' }}>
      {/* Left panel */}
      <div className="hidden md:flex flex-col justify-between w-1/2 p-12"
        style={{ background: 'var(--ink)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--brand)' }}>
            <Compass className="w-6 h-6 text-white" />
          </div>
          <span className="font-display text-xl text-white">Bússola</span>
        </div>
        <div>
          <h1 className="font-display text-4xl text-white leading-tight mb-4">
            Saiba para onde<br />vai cada real.
          </h1>
          <p className="text-white/60 text-base leading-relaxed max-w-sm">
            Importe extratos, classifique despesas e siga a régua 50/30/20
            com orientação clara — sem jargão e sem vender produto.
          </p>
          <div className="flex gap-3 mt-8">
            {['Régua 50/30/20', 'Importação por PDF', 'LGPD'].map(tag => (
              <span key={tag} className="px-3 py-1.5 rounded-full text-xs border border-white/20 text-white/60">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <p className="text-white/30 text-xs">
          © 2026 Bússola — orientação, não recomendação.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-2 mb-8">
            <Compass className="w-6 h-6" style={{ color: 'var(--brand)' }} />
            <span className="font-display text-xl" style={{ color: 'var(--ink)' }}>Bússola</span>
          </div>

          <h2 className="font-display text-2xl mb-1" style={{ color: 'var(--ink)' }}>
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
            Use sua conta para continuar.
          </p>

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
              </label>
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
            {info  && <p className="text-sm text-green-700">{info}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ background: 'var(--brand)' }}>
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="text-center text-sm mt-4" style={{ color: 'var(--muted)' }}>
            {mode === 'login' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="font-medium hover:underline" style={{ color: 'var(--brand)' }}>
              {mode === 'login' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
