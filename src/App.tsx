import { useEffect } from 'react'
import { createRouter, RouterProvider, createRoute, createRootRoute, createHashHistory, Outlet, Navigate, useNavigate } from '@tanstack/react-router'
import { AuthProvider, useAuth } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'
import { AuthPage } from '@/pages/AuthPage'
import { ForcePasswordChangePage } from '@/pages/ForcePasswordChangePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportPage } from '@/pages/ImportPage'
import { AssetsPage } from '@/pages/AssetsPage'
import { DebtsPage } from '@/pages/DebtsPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { AdminPage } from '@/pages/AdminPage'
import { SimuladorPage } from '@/pages/SimuladorPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { DiagnosticoPage } from '@/pages/DiagnosticoPage'

// Le a rota atual direto do hash do navegador (fonte da verdade real),
// em vez do hook useLocation() do router: esse hook pode refletir, de
// forma otimista, o DESTINO de uma navegacao ainda em andamento (por
// exemplo, o proprio "/auth" para o qual estamos prestes a redirecionar)
// no mesmo ciclo de render em que decidimos salvar a rota de origem.
// Usar isso causava o bug de sempre salvar "/auth" como destino do
// redirecionamento pos-login, em vez da rota que a pessoa realmente
// tentou acessar.
function currentAppPath() {
  const hash = window.location.hash.replace(/^#/, '')
  return hash || '/'
}

const rootRoute = createRootRoute({ component: () => <Outlet /> })
const authRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth', component: AuthPage })

function AuthGuard() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  // Se o usuário chegou autenticado numa rota protegida por causa de um link
  // direto (ex: /diagnostico), volta pra essa mesma rota depois do login.
  useEffect(() => {
    if (!loading && user) {
      const target = sessionStorage.getItem('arsen_redirect_after_login')
      sessionStorage.removeItem('arsen_redirect_after_login')
      if (target && target !== '/auth' && target !== currentAppPath()) {
        navigate({ to: target as any })
      }
    }
  }, [user, loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
        <div className="w-8 h-8 rounded-full border-4 animate-spin"
          style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (!user) {
    const path = currentAppPath()
    if (path !== '/auth') {
      sessionStorage.setItem('arsen_redirect_after_login', path)
    }
    return <Navigate to="/auth" />
  }
  // Contas criadas pelo admin nascem com essa flag e precisam trocar a
  // senha temporária antes de acessar qualquer outra parte do app.
  if (user.user_metadata?.must_change_password === true) {
    return <ForcePasswordChangePage />
  }
  return <AppShell><Outlet /></AppShell>
}

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AuthGuard })
const dashRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: DashboardPage })
const importRoute = createRoute({ getParentRoute: () => appRoute, path: '/importar', component: ImportPage })
const assetsRoute = createRoute({ getParentRoute: () => appRoute, path: '/ativos', component: AssetsPage })
const debtsRoute = createRoute({ getParentRoute: () => appRoute, path: '/dividas', component: DebtsPage })
const goalsRoute = createRoute({ getParentRoute: () => appRoute, path: '/metas', component: GoalsPage })
const simuladorRoute = createRoute({ getParentRoute: () => appRoute, path: '/simulador', component: SimuladorPage })
const diagnosticoRoute = createRoute({ getParentRoute: () => appRoute, path: '/diagnostico', component: DiagnosticoPage })
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/perfil', component: ProfilePage })
const adminRoute = createRoute({ getParentRoute: () => appRoute, path: '/admin', component: AdminPage })

const router = createRouter({
  routeTree: rootRoute.addChildren([
    authRoute,
    appRoute.addChildren([dashRoute, importRoute, assetsRoute, debtsRoute, goalsRoute, simuladorRoute, diagnosticoRoute, profileRoute, adminRoute]),
  ]),
  history: createHashHistory(),
})

declare module '@tanstack/react-router' { interface Register { router: typeof router } }

export default function App() {
  return <AuthProvider><RouterProvider router={router} /></AuthProvider>
}
