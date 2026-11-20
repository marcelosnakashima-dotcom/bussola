import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, ShieldCheck, LineChart, Upload } from 'lucide-react'
import { ArsenLogo } from '@/components/ArsenLogo'
import { supabase } from '@/lib/supabase'
import { POS_LOGIN } from '@/lib/auth'

// Mensagens do Supabase traduzidas; o resto vira uma mensagem genérica (sem detalhes técnicos).
function traduzErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (/network|fetch/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.'
  return 'Não foi possível entrar. Tente novamente.'
}

const DESTAQUES = [
  { Icon: LineChart, texto: 'Receitas, despesas e patrimônio num só lugar' },
  { Icon: Upload, texto: 'Importe extratos e faturas em segundos' },
  { Icon: ShieldCheck, texto: 'Seus dados visíveis só para você e sua família' },
]

export function AuthPage() {
  const navigate = useNavigate()
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [ver,     setVer]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
      if (err) throw err
      const target = sessionStorage.getItem('arsen_redirect_after_login')
      sessionStorage.removeItem('arsen_redirect_after_login')
      if (!target) sessionStorage.setItem(POS_LOGIN, '1')
      navigate({ to: (target || '/') as any })
    } catch (err: any) {
      setError(traduzErro(err?.message ?? ''))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    sessionStorage.setItem(POS_LOGIN, '1')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
  }

  const input = 'w-full px-3.5 py-3 rounded-xl border border-line bg-surface text-sm text-ink outline-none transition-shadow focus:ring-4'

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-canvas">
      {/* Painel da marca (computador) */}
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12" style={{ background: 'var(--chrome)' }}>
        <div className="flex items-center gap-3">
          <ArsenLogo className="w-9 h-9" />
          <div>
            <p className="font-display text-xl text-white leading-none">Arsen</p>
            <p className="text-xs mt-1 text-white/50">orientação financeira</p>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-[44px] leading-[1.05] text-white">Suas finanças,<br />com clareza.</h1>
          <p className="mt-4 text-white/60 text-[15px]">
            Acompanhe para onde vai o seu dinheiro e siga o plano montado com a sua consultoria.
          </p>
          <ul className="mt-8 space-y-3">
            {DESTAQUES.map(({ Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm text-white/80">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10">
                  <Icon className="w-4 h-4 text-white" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        {/* gráfico decorativo (sem dados) */}
        <svg className="absolute -right-10 bottom-24 w-[520px] opacity-[0.18]" viewBox="0 0 520 200" aria-hidden="true">
          <path d="M0 170 C 60 160, 90 120, 140 128 S 230 80, 280 92 S 380 30, 430 44 S 500 10, 520 14" fill="none" stroke="#6BBD97" strokeWidth="3" />
          <path d="M0 170 C 60 160, 90 120, 140 128 S 230 80, 280 92 S 380 30, 430 44 S 500 10, 520 14 L 520 200 L 0 200 Z" fill="#6BBD97" opacity="0.25" />
        </svg>

        <p className="relative z-10 text-xs text-white/35">Conteúdo educativo. Não constitui recomendação de investimento.</p>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <ArsenLogo className="w-7 h-7" />
            <span className="font-display text-xl text-ink">Arsen</span>
          </div>

          <h2 className="font-display text-3xl text-ink">Entrar</h2>
          <p className="text-sm text-muted mt-1 mb-8">Acesso exclusivo para clientes e equipe Arsen.</p>

          <button onClick={handleGoogle} type="button"
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-line bg-surface text-sm font-medium text-ink transition-colors hover:bg-surface-2">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuar com Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs text-muted">ou com e-mail</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
            <div>
              <label htmlFor="email" className="block text-sm mb-1.5 font-medium text-ink">E-mail</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required
                className={input} style={{ ['--tw-ring-color' as string]: 'var(--ring)' }} />
            </div>
            <div>
              <label htmlFor="senha" className="block text-sm mb-1.5 font-medium text-ink">Senha</label>
              <div className="relative">
                <input id="senha" type={ver ? 'text' : 'password'} autoComplete="current-password" value={pass}
                  onChange={e => setPass(e.target.value)} required
                  className={`${input} pr-11`} style={{ ['--tw-ring-color' as string]: 'var(--ring)' }} />
                <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:text-ink">
                  {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm rounded-xl px-3 py-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 hover:brightness-110"
              style={{ background: 'var(--brand)' }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-xs text-muted mt-8 text-center">
            Esqueceu a senha ou ainda não tem acesso? Fale com a equipe Arsen.
          </p>
        </div>
      </main>
    </div>
  )
}
