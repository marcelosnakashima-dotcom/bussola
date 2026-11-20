import { describe, it, expect } from 'vitest'
import { situacaoCliente, tempoDesde, casaBusca } from './admin'

const HOJE = new Date(Date.UTC(2026, 10, 20)) // 20/11/2026

describe('situação do cliente', () => {
  it('pelo último lançamento', () => {
    expect(situacaoCliente(null, HOJE)).toEqual({ situacao: 'sem_dados', dias: null })
    expect(situacaoCliente('2026-11-01', HOJE)).toEqual({ situacao: 'em_dia', dias: 19 })
    expect(situacaoCliente('2026-10-16', HOJE).situacao).toBe('em_dia')   // 35 dias
    expect(situacaoCliente('2026-10-15', HOJE).situacao).toBe('atencao')  // 36 dias
    expect(situacaoCliente('2026-09-21', HOJE).situacao).toBe('atencao')  // 60 dias
    expect(situacaoCliente('2026-09-20', HOJE).situacao).toBe('parado')   // 61 dias
  })
  it('aceita data com hora (timestamp)', () => {
    expect(situacaoCliente('2026-11-19T22:10:00+00:00', HOJE).dias).toBe(1)
  })
})

describe('tempo desde', () => {
  it('textos curtos', () => {
    expect(tempoDesde(null, HOJE)).toBe('nunca')
    expect(tempoDesde('2026-11-20', HOJE)).toBe('hoje')
    expect(tempoDesde('2026-11-19', HOJE)).toBe('ontem')
    expect(tempoDesde('2026-11-10', HOJE)).toBe('há 10 dias')
    expect(tempoDesde('2026-09-15', HOJE)).toBe('há 2 meses')
    expect(tempoDesde('2026-10-15', HOJE)).toBe('há 1 mês')
    expect(tempoDesde('2024-10-01', HOJE)).toBe('há 2 anos')
  })
})

describe('busca de clientes', () => {
  const membros = [{ nome: 'Ana Exemplo', email: 'ana@exemplo.test' }, { nome: 'bruno', email: null }]
  it('por nome ou e-mail, sem acento e sem caixa', () => {
    expect(casaBusca(membros, 'ANA')).toBe(true)
    expect(casaBusca(membros, 'exemplo.test')).toBe(true)
    expect(casaBusca(membros, 'brúno')).toBe(true)
    expect(casaBusca(membros, 'carla')).toBe(false)
    expect(casaBusca(membros, '  ')).toBe(true)
  })
})
