import { describe, it, expect } from 'vitest'
import { maskForCategorization, merchantKey, buildHistoryIndex, lookupHistory, chunk, flagDuplicates, looksInverted } from './ofxImport'

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

describe('limpeza de ruído do banco', () => {
  it('remove data/hora embutida e "Data balanc."', () => {
    expect(maskForCategorization('Compra com Cartão - 01/01 10:46 PAN E CONF SAGRAD - Data balanc.: 02/01/2026'))
      .toBe('Compra com Cartão - PAN E CONF SAGRAD')
    expect(maskForCategorization('Cobrança de Juros - Juros Saldo Devedor Conta - Data balanc.: 02/01/2026'))
      .toBe('Cobrança de Juros - Juros Saldo Devedor Conta')
  })
})

describe('merchantKey', () => {
  it('mesma loja em dias e horários diferentes gera a mesma chave', () => {
    const a = merchantKey('Compra com Cartão - 01/01 10:46 PAN E CONF SAGRAD - Data balanc.: 02/01/2026')
    const b = merchantKey('Compra com Cartão - 15/01 20:48 PAN E CONF SAGRAD - Data balanc.: 16/01/2026')
    expect(a).toBe('PAN E CONF SAGRAD')
    expect(a).toBe(b)
  })
  it('ignora acentos e prefixos de operação', () => {
    expect(merchantKey('Cobrança de IOF Saldo')).toBe(merchantKey('COBRANCA DE iof saldo'))
  })
})

describe('histórico de categorias', () => {
  const rows = [
    ...Array.from({ length: 3 }, () => ({ descricao: 'Compra com Cartão - 03/01 09:00 PADARIA SOL - Data balanc.: 04/01/2026', tipo: 'despesa', categoria_id: 'c-alimentacao' })),
    { descricao: 'Compra com Cartão - 10/02 09:00 PADARIA SOL', tipo: 'despesa', categoria_id: 'c-restaurante' },
    { descricao: 'Mercado Bom', tipo: 'despesa', categoria_id: 'c-alimentacao' },
    { descricao: 'Mercado Bom', tipo: 'despesa', categoria_id: 'c-compras' },
    { descricao: 'Sem categoria', tipo: 'despesa', categoria_id: null },
    { descricao: 'Transf', tipo: 'transferencia', categoria_id: 'c-lazer' },
  ]
  const idx = buildHistoryIndex(rows)
  it('usa a categoria majoritária (>= 60%)', () => {
    expect(lookupHistory(idx, 'Compra com Cartão - 20/03 18:00 PADARIA SOL', 'despesa')).toBe('c-alimentacao')
  })
  it('sem maioria clara, não decide', () => {
    expect(lookupHistory(idx, 'Mercado Bom', 'despesa')).toBeNull()
  })
  it('separa despesa de receita e ignora transferências e itens sem categoria', () => {
    expect(lookupHistory(idx, 'Compra com Cartão - 20/03 18:00 PADARIA SOL', 'receita')).toBeNull()
    expect(lookupHistory(idx, 'Sem categoria', 'despesa')).toBeNull()
    expect(lookupHistory(idx, 'Transf', 'transferencia')).toBeNull()
  })
})
