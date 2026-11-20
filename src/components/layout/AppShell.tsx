import type { ReactNode } from 'react'
import { Shell } from './Shell'
import { CLIENT_NAV, CLIENT_TABS, ADMIN_NAV, ADMIN_TABS } from './nav'

export function AppShell({ children }: { children: ReactNode }) {
  return <Shell area="cliente" groups={CLIENT_NAV} tabs={CLIENT_TABS}>{children}</Shell>
}

export function AdminShell({ children }: { children: ReactNode }) {
  return <Shell area="admin" groups={ADMIN_NAV} tabs={ADMIN_TABS}>{children}</Shell>
}
