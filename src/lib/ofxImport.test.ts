import { describe, it, expect } from 'vitest'
import { maskForCategorization, chunk, flagDuplicates, looksInverted } from './ofxImport'

describe('maskForCategorization', () => {
  it('troca CPF, CNPJ e números longos, mantém os curtos', () => {
    expect(maskForCategorization('PIX ENVIADO JOSE 123.456.789-00')).toBe('PIX ENVIADO JOSE #')
    expect(maskForCategorization('PAG 12.345.678/0001-90 LOJA')).toBe('PAG # LOJA')
    expect(maskForCategorization('Conta 123456789 agencia 0001')).toBe('Conta # agencia 0001')
    expect(maskForCategorization('Uber 99 Viagem')).toBe('Uber 99 Viagem')
  })
  it('colapsa espaços e limita o tamanho', () => {
    expect(maskForCategorization('  A   B  ')).toBe('A B')
    expect(maskForCategorization('x'.repeat(500))).toHaveLength(200)
  })
})

describe('chunk', () => {
  it('divide em blocos', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('flagDuplicates', () => {
  const rows = [{ externalId: 'A' }, { externalId: 'B' }, { externalId: 'A' }, { externalId: null }]
  it('reimportar o mesmo arquivo marca tudo como duplicado (nada novo)', () => {
    const out = flagDuplicates(rows, new Set(['A', 'B']))
    expect(out.filter(o => !o.duplicate && o.row.externalId !== null)).toEqual([])
  })
  it('FITID repetido dentro do arquivo: o primeiro mantém, o repetido entra sem FITID', () => {
    const out = flagDuplicates(rows, new Set())
    expect(out.map(o => [o.duplicate, o.externalId])).toEqual([
      [false, 'A'], [false, 'B'], [false, null], [false, null],
    ])
  })
  it('importação parcial: só o novo passa', () => {
    const out = flagDuplicates(rows.slice(0, 2), new Set(['A']))
    expect(out.map(o => o.duplicate)).toEqual([true, false])
  })
})

describe('looksInverted', () => {
  it('só sugere para cartão com maioria de receitas e amostra mínima', () => {
    const maioriaReceita = ['receita', 'receita', 'receita', 'receita', 'despesa'] as const
    expect(looksInverted('cartao', [...maioriaReceita])).toBe(true)
    expect(looksInverted('conta', [...maioriaReceita])).toBe(false)
    expect(looksInverted('cartao', ['receita', 'receita'])).toBe(false)
    expect(looksInverted('cartao', ['despesa', 'despesa', 'despesa', 'despesa', 'receita'])).toBe(false)
  })
})
