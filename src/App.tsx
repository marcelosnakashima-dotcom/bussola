import { createRouter, RouterProvider, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { AuthProvider, useAuth } from '@/lib/auth'
import { AppShell }      from '@/components/layout/AppShell'
import { AuthPage }      from '@/pages/AuthPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportPage }    from '@/pages/ImportPage'
import { AssetsPage }    from '@/pages/AssetsPage'
import { GoalsPage }     from '@/pages/GoalsPage'
import { AdminPage }     from '@/pages/AdminPage'

const rootRoute  = createRootRoute({ component: () => <Outlet /> })
const authRoute  = createRoute({ getParentRoute: () => rootRoute, path: '/auth', component: AuthPage })

function AuthGuard() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-4 animate-spin"
        style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
    </div>
  )
  if (!user) { window.location.href = '/auth'; return null }
  return <AppShell><Outlet /></AppShell>
}

const appRoute    = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AuthGuard })
const dashRoute   = createRoute({ getParentRoute: () => appRoute, path: '/',        component: DashboardPage })
const importRoute = createRoute({ getParentRoute: () => appRoute, path: '/importar', component: ImportPage })
const assetsRoute = createRoute({ getParentRoute: () => appRoute, path: '/ativos',   component: AssetsPage })
const goalsRoute  = createRoute({ getParentRoute: () => appRoute, path: '/metas',    component: GoalsPage })
const adminRoute  = createRoute({ getParentRoute: () => appRoute, path: '/admin',    component: AdminPage })

const router = createRouter({
  routeTree: rootRoute.addChildren([
    authRoute,
    appRoute.addChildren([dashRoute, importRoute, assetsRoute, goalsRoute, adminRoute]),
  ]),
})

declare module '@tanstack/react-router' { interface Register { router: typeof router } }

export default function App() {
  return <AuthProvider><RouterProvider router={router} /></AuthProvider>
}
