import { useEffect } from 'react'
import { createRouter, RouterProvider, createRoute, createRootRoute, createHashHistory, Outlet, Navigate, useLocation, useNavigate } from '@tanstack/react-router'
import { AuthProvider, useAuth } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'
import { AuthPage } from '@/pages/AuthPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportPage } from '@/pages/ImportPage'
import { AssetsPage } from '@/pages/AssetsPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { AdminPage } from '@/pages/AdminPage'
import { SimuladorPage } from '@/pages/SimuladorPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { DiagnosticoPage } from '@/pages/DiagnosticoPage'

const rootRoute = createRootRoute({ component: () => <Outlet /> })
const authRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth', component: AuthPage })

function AuthGuard() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Se o usuário chegou autenticado numa rota protegida por causa de um link
  // direto (ex: /diagnostico), volta pra essa mesma rota depois do login.
  useEffect(() => {
    if (!loading && user) {
      const target = sessionStorage.getItem('arsen_redirect_after_login')
      if (target) {
        sessionStorage.removeItem('arsen_redirect_after_login')
        if (target !== location.pathname) navigate({ to: target as any })
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
    sessionStorage.setItem('arsen_redirect_after_login', location.pathname)
    return <Navigate to="/auth" />
  }
  return <AppShell><Outlet /></AppShell>
}

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AuthGuard })
const dashRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: DashboardPage })
const importRoute = createRoute({ getParentRoute: () => appRoute, path: '/importar', component: ImportPage })
const assetsRoute = createRoute({ getParentRoute: () => appRoute, path: '/ativos', component: AssetsPage })
const goalsRoute = createRoute({ getParentRoute: () => appRoute, path: '/metas', component: GoalsPage })
const simuladorRoute = createRoute({ getParentRoute: () => appRoute, path: '/simulador', component: SimuladorPage })
const diagnosticoRoute = createRoute({ getParentRoute: () => appRoute, path: '/diagnostico', component: DiagnosticoPage })
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/perfil', component: ProfilePage })
const adminRoute = createRoute({ getParentRoute: () => appRoute, path: '/admin', component: AdminPage })

const router = createRouter({
  routeTree: rootRoute.addChildren([
    authRoute,
    appRoute.addChildren([dashRoute, importRoute, assetsRoute, goalsRoute, simuladorRoute, diagnosticoRoute, profileRoute, adminRoute]),
  ]),
  history: createHashHistory(),
})

declare module '@tanstack/react-router' { interface Register { router: typeof router } }

export default function App() {
  return <AuthProvider><RouterProvider router={router} /></AuthProvider>
}
