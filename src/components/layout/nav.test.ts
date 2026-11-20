import { describe, it, expect } from 'vitest'
import { isActive } from './nav'

describe('item ativo do menu', () => {
  const admin = ['/admin', '/admin/gestao']
  it('a rota mais específica vence', () => {
    expect(isActive('/admin/gestao', '/admin', admin)).toBe(false)
    expect(isActive('/admin/gestao', '/admin/gestao', admin)).toBe(true)
  })
  it('sub-rotas sem item próprio acendem o item pai', () => {
    expect(isActive('/admin/clientes/abc', '/admin', admin)).toBe(true)
    expect(isActive('/admin', '/admin', admin)).toBe(true)
  })
  it('a raiz só acende na raiz', () => {
    expect(isActive('/', '/', ['/', '/despesas'])).toBe(true)
    expect(isActive('/despesas', '/', ['/', '/despesas'])).toBe(false)
  })
  it('não confunde prefixo de palavra', () => {
    expect(isActive('/contas-extra', '/contas', ['/contas'])).toBe(false)
  })
})
