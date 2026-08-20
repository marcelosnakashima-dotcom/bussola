import { type ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  LayoutDashboard, Upload, Wallet, SlidersHorizontal,
  ShieldCheck, LogOut, Compass, Calculator
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useUserRole } from '@/hooks/useData'

const NAV = [
  { to: '/',          label: 'Visão geral',         short: 'Visão',    Icon: LayoutDashboard },
  { to: '/importar',  label: 'Importar despesas',   short: 'Importar', Icon: Upload },
  { to: '/ativos',    label: 'Ativos e patrimônio', short: 'Ativos',   Icon: Wallet },
  { to: '/metas',     label: 'Metas 50/30/20',      short: 'Metas',    Icon: SlidersHorizontal },
  { to: '/simulador', label: 'Simulador',           short: 'Simular',  Icon: Calculator },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { isAdmin }       = useUserRole()
  const location          = useLocation()

  const navItems = [
    ...NAV,
    ...(isAdmin ? [{ to: '/admin', label: 'Administração', short: 'Admin', Icon: ShieldCheck }] : []),
  ]

  const gridCols =
    navItems.length >= 6 ? 'grid-cols-6' :
    navItems.length === 5 ? 'grid-cols-5' : 'grid-cols-4'

  return (
    <div className="min-h-screen flex bg-canvas">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between sticky top-0 h-screen"
        style={{ background: 'var(--ink)' }}>
        {/* Logo */}
        <div>
          <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--brand)' }}>
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-display text-base text-white leading-none">Bússola</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                orientação financeira
              </p>
            </div>
          </div>
          {/* Nav links */}
          <nav className="px-3 py-4 flex flex-col gap-1">
            {navItems.map(({ to, label, Icon }) => {
              const active = location.pathname === to ||
                (to !== '/' && location.pathname.startsWith(to))
              return (
                <Link key={to} to={to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
        {/* User */}
        <div className="px-5 py-5 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
              style={{ background: 'var(--brand)' }}>
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm truncate">
                {user?.user_metadata?.full_name ?? user?.email?.split('@')[0]}
              </p>
              {isAdmin && (
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Administrador
                </p>
              )}
            </div>
          </div>
          <button onClick={signOut}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors w-full">
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      {/* ── Mobile header ── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 flex items-center justify-between px-4 h-14 border-b border-white/10"
        style={{ background: 'var(--ink)' }}>
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5" style={{ color: 'var(--brand-lt)' }} />
          <span className="font-display text-base text-white">Bússola</span>
        </div>
        <button onClick={signOut} className="p-2 text-white/60 hover:text-white">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-24 md:pb-0 overflow-auto">
        {children}
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t"
        style={{
          background: 'var(--ink)',
          borderColor: 'rgba(255,255,255,0.1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <ul className={`grid ${gridCols}`}>
          {navItems.map(({ to, short, Icon }) => {
            const active = location.pathname === to ||
              (to !== '/' && location.pathname.startsWith(to))
            return (
              <li key={to}>
                <Link to={to} className={`flex flex-col items-center justify-center gap-1 py-3 min-h-[52px] text-[10px] w-full transition-colors ${
                  active ? 'text-white' : 'text-white/50'
                }`}>
                  <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-white/50'}`} />
                  <span>{short}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
