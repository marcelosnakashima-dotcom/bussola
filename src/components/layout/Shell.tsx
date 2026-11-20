import { type ReactNode, useEffect, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { LogOut, PanelLeftClose, PanelLeftOpen, User, ShieldCheck, ArrowLeftRight, X, Sun, Moon, Monitor } from 'lucide-react'
import { aplicarTema, lerTema, salvarTema, type TemaPref } from '@/lib/theme'
import { ArsenLogo } from '@/components/ArsenLogo'
import { ToastContainer } from '@/components/Toast'
import { useAuth } from '@/lib/auth'
import { type NavGroup, MoreIcon, isActive } from './nav'

const CHAVE_MENU = 'arsen.menu-oculto'

export interface ShellProps {
  area: 'cliente' | 'admin'
  groups: NavGroup[]
  tabs: string[]
  children: ReactNode
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'U'
}

export function Shell({ area, groups, tabs, children }: ShellProps) {
  const { user, role, signOut } = useAuth()
  const { pathname } = useLocation()
  const isAdmin = role === 'admin'
  const nome = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split('@')[0] ?? 'Você'

  // Menu lateral ocultável (desktop), para apresentar em tela cheia. A escolha fica no navegador.
  const [menuOculto, setMenuOculto] = useState(false)
  useEffect(() => {
    try { setMenuOculto(localStorage.getItem(CHAVE_MENU) === '1') } catch { /* sem armazenamento: menu visível */ }
  }, [])
  const alternarMenu = () => setMenuOculto(v => {
    try { localStorage.setItem(CHAVE_MENU, v ? '0' : '1') } catch { /* ignora */ }
    return !v
  })

  const [maisAberto, setMaisAberto] = useState(false)
  const [tema, setTema] = useState<TemaPref>(() => lerTema())
  const trocarTema = (t: TemaPref) => { setTema(t); salvarTema(t) }
  // em "sistema", acompanha a troca de claro/escuro do aparelho
  useEffect(() => {
    if (tema !== 'sistema') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const f = () => aplicarTema('sistema')
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [tema])
  useEffect(() => { setMaisAberto(false) }, [pathname])
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const fechar = () => { if (mq.matches) setMaisAberto(false) }
    mq.addEventListener('change', fechar)
    return () => mq.removeEventListener('change', fechar)
  }, [])

  const allItems = groups.flatMap(g => g.items)
  const allTos = allItems.map(i => i.to)
  const tabItems = tabs.map(t => allItems.find(i => i.to === t)).filter((i): i is NonNullable<typeof i> => !!i)

  // Atalho para a outra área (só para admin)
  const troca = isAdmin
    ? area === 'admin'
      ? { to: '/', label: 'Minha área financeira', Icon: ArrowLeftRight }
      : { to: '/admin', label: 'Área do administrador', Icon: ShieldCheck }
    : null

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-5" aria-label={area === 'admin' ? 'Menu do administrador' : 'Menu principal'}>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{g.label}</p>}
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ to, label, Icon }) => {
              const active = isActive(pathname, to, allTos)
              return (
                <Link key={to} to={to} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                    active ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full" style={{ background: 'var(--brand-lt)' }} />}
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  const UserBlock = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="border-t border-white/10 pt-4 flex flex-col gap-1">
      <div className="flex items-center gap-3 px-2 mb-2">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ background: 'var(--brand)' }}>{initials(nome)}</div>
        <div className="min-w-0">
          <p className="text-white text-sm truncate">{nome}</p>
          <p className="text-[11px] text-white/45">{isAdmin ? 'Administrador' : 'Cliente'}</p>
        </div>
      </div>
      {troca && (
        <Link to={troca.to} onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5">
          <troca.Icon className="w-4 h-4" /> {troca.label}
        </Link>
      )}
      {area === 'cliente' && (
        <Link to="/perfil" onClick={onNavigate}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-white/5 ${isActive(pathname, '/perfil') ? 'text-white bg-white/10' : 'text-white/70 hover:text-white'}`}>
          <User className="w-4 h-4" /> Perfil
        </Link>
      )}
      <div role="radiogroup" aria-label="Tema" className="mx-2 my-1 grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
        {([['claro', 'Claro', Sun], ['escuro', 'Escuro', Moon], ['sistema', 'Auto', Monitor]] as const).map(([v, l, I]) => (
          <button key={v} type="button" role="radio" aria-checked={tema === v} onClick={() => trocarTema(v)} title={`Tema ${l.toLowerCase()}`}
            className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition-colors ${tema === v ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>
            <I className="w-3.5 h-3.5" /> {l}
          </button>
        ))}
      </div>
      <button onClick={signOut}
        className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/5 text-left">
        <LogOut className="w-4 h-4" /> Sair
      </button>
    </div>
  )

  const Brand = () => (
    <div className="flex items-center gap-3">
      <ArsenLogo className="w-8 h-8 shrink-0" />
      <div>
        <p className="font-display text-[17px] text-white leading-none">Arsen</p>
        <p className="text-[11px] mt-1 text-white/45">{area === 'admin' ? 'administração' : 'orientação financeira'}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-canvas">
      {/* Menu lateral (desktop) */}
      <aside className={`${menuOculto ? 'hidden' : 'hidden md:flex'} w-[248px] shrink-0 flex-col sticky top-0 h-screen px-3 py-5 overflow-y-auto`}
        style={{ background: 'linear-gradient(180deg, var(--chrome) 0%, color-mix(in srgb, var(--chrome) 82%, var(--brand)) 100%)' }}>
        <div className="px-2 flex items-center justify-between mb-6">
          <Brand />
          <button onClick={alternarMenu} title="Ocultar o menu" aria-label="Ocultar o menu"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1"><NavLinks /></div>
        <UserBlock />
      </aside>

      {menuOculto && (
        <button onClick={alternarMenu} title="Mostrar o menu" aria-label="Mostrar o menu"
          className="hidden md:flex fixed left-4 bottom-4 z-30 items-center gap-2 rounded-xl px-3 py-2 text-xs text-white"
          style={{ background: 'var(--chrome)', boxShadow: 'var(--shadow-md)' }}>
          <PanelLeftOpen className="w-4 h-4" /> Menu
        </button>
      )}

      {/* Topo (celular) */}
      <header className="md:hidden fixed top-0 inset-x-0 z-20 flex items-center justify-between px-4 h-14"
        style={{ background: 'var(--chrome)' }}>
        <Brand />
      </header>

      <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-24 md:pb-0 aurora">
        {children}
      </main>

      {/* Barra inferior (celular): atalhos + Mais */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-white/10"
        style={{ background: 'var(--chrome)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Atalhos">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabItems.length + 1}, minmax(0, 1fr))` }}>
          {tabItems.map(({ to, short, Icon }) => {
            const active = isActive(pathname, to, allTos)
            return (
              <li key={to}>
                <Link to={to} aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[10px] ${active ? 'text-white' : 'text-white/50'}`}>
                  <Icon className="w-5 h-5" />
                  <span>{short}</span>
                </Link>
              </li>
            )
          })}
          <li>
            <Dialog.Root open={maisAberto} onOpenChange={setMaisAberto}>
              <Dialog.Trigger className="w-full flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[10px] text-white/50">
                <MoreIcon className="w-5 h-5" />
                <span>Mais</span>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="md:hidden fixed inset-0 z-40 bg-black/40" />
                <Dialog.Content className="md:hidden fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl px-4 pt-4 pb-8"
                  style={{ background: 'var(--chrome)' }}>
                  <div className="flex items-center justify-between mb-4 px-1">
                    <Dialog.Title className="text-white font-medium">Menu</Dialog.Title>
                    <Dialog.Close className="p-2 text-white/60" aria-label="Fechar"><X className="w-5 h-5" /></Dialog.Close>
                  </div>
                  <Dialog.Description className="sr-only">Todas as seções do app</Dialog.Description>
                  <NavLinks onNavigate={() => setMaisAberto(false)} />
                  <div className="mt-5"><UserBlock onNavigate={() => setMaisAberto(false)} /></div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </li>
        </ul>
      </nav>

      <ToastContainer />
    </div>
  )
}
