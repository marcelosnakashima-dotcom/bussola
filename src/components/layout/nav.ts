import {
  LayoutDashboard, Upload, TrendingDown, TrendingUp, Wallet, CreditCard, SlidersHorizontal, Calculator, ClipboardList,
  Landmark, LineChart, Users, Menu, type LucideIcon,
} from 'lucide-react'

export interface NavItem { to: string; label: string; short: string; Icon: LucideIcon }
export interface NavGroup { label?: string; items: NavItem[] }

// Área do cliente
export const CLIENT_NAV: NavGroup[] = [
  { items: [{ to: '/', label: 'Visão geral', short: 'Início', Icon: LayoutDashboard }] },
  { label: 'Movimentação', items: [
    { to: '/despesas', label: 'Despesas', short: 'Despesas', Icon: TrendingDown },
    { to: '/receitas', label: 'Receitas', short: 'Receitas', Icon: TrendingUp },
    { to: '/importar', label: 'Importar extratos', short: 'Importar', Icon: Upload },
    { to: '/contas', label: 'Contas e cartões', short: 'Contas', Icon: Landmark },
  ] },
  { label: 'Patrimônio', items: [
    { to: '/ativos', label: 'Ativos', short: 'Ativos', Icon: Wallet },
    { to: '/dividas', label: 'Dívidas', short: 'Dívidas', Icon: CreditCard },
  ] },
  { label: 'Planejamento', items: [
    { to: '/metas', label: 'Metas 50/30/20', short: 'Metas', Icon: SlidersHorizontal },
    { to: '/plano', label: 'Meu plano', short: 'Plano', Icon: LineChart },
    { to: '/simulador', label: 'Simulador', short: 'Simular', Icon: Calculator },
    { to: '/diagnostico', label: 'Diagnóstico', short: 'Diagnóstico', Icon: ClipboardList },
  ] },
]
// Barra inferior do celular: 4 atalhos + "Mais"
export const CLIENT_TABS = ['/', '/despesas', '/receitas', '/importar']

// Área do administrador
export const ADMIN_NAV: NavGroup[] = [
  { label: 'Administração', items: [
    { to: '/admin', label: 'Clientes e acessos', short: 'Clientes', Icon: Users },
  ] },
]
export const ADMIN_TABS = ['/admin']

export const MoreIcon = Menu

// Ativo na própria rota e nas sub-rotas (ex.: /admin/clientes ativa /admin só quando não há item mais específico)
export function isActive(pathname: string, to: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(to + '/'))
}
