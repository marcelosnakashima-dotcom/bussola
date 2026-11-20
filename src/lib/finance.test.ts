import { describe, it, expect } from 'vitest'
import {
  addMonths, lastMonths, daysInMonth, monthBounds, periodMonths, monthlySeries, byCategory, resumo503020,
  filterDespesas, dailyCumulative, incomeSources, fonteKey, groupByDay, monthLabel, SEM_CATEGORIA,
  dailyTotals, firstWeekday, projecaoFimDoMes, isDespesa,
  type Tx, type CatInfo,
} from './finance'

// Dados 100% sintéticos.
const cats = new Map<string, CatInfo>([
  ['c-alimentacao', { nome: 'Alimentação', classificacao: 'necessidade' }],
  ['c-lazer', { nome: 'Lazer', classificacao: 'desejo' }],
  ['c-investimentos', { nome: 'Investimentos', classificacao: 'poupanca' }],
])
let n = 0
const tx = (p: Partial<Tx>): Tx => ({
  id: `t${++n}`, data: '2026-10-10', descricao: 'X', categoria_id: null, tipo: 'despesa', valor: 10, status: 'confirmada', account_id: null, ...p,
})

describe('meses', () => {
  it('soma meses atravessando o ano', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })
  it('últimos N meses em ordem crescente e períodos', () => {
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(periodMonths('mes', '2026-10')).toEqual(['2026-10'])
    expect(periodMonths('12m', '2026-10')).toHaveLength(12)
  })
  it('dias do mês, limites e rótulo', () => {
    expect(daysInMonth('2028-02')).toBe(29)
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthLabel('2026-10')).toBe('Outubro de 2026')
    expect(monthLabel('2026-10', 'short')).toBe('out/26')
  })
})

describe('série mensal', () => {
  const txs = [
    tx({ tipo: 'receita', valor: 5000 }),
    tx({ valor: '100.50', categoria_id: 'c-alimentacao' }),
    tx({ valor: 50, categoria_id: 'c-lazer' }),
    tx({ valor: 30, categoria_id: null }),
    tx({ valor: 999, tipo: 'transferencia' }),         // transferência fica de fora
    tx({ valor: 777, status: 'pendente' }),            // pendente fica de fora
    tx({ valor: 40, data: '2026-09-05', categoria_id: 'c-investimentos' }),
    tx({ valor: 1, data: '2025-01-01' }),              // fora da janela
  ]
  const s = monthlySeries(txs, ['2026-09', '2026-10'], cats)
  it('soma receitas, despesas, saldo e grupos por mês', () => {
    expect(s[1]).toMatchObject({ mes: '2026-10', receitas: 5000, despesas: 180.5, saldo: 4819.5, necessidade: 100.5, desejo: 50, poupanca: 0, semClasse: 30 })
    expect(s[0]).toMatchObject({ mes: '2026-09', despesas: 40, poupanca: 40, receitas: 0, saldo: -40 })
  })
  it('mês sem movimento aparece zerado', () => {
    expect(monthlySeries([], ['2026-10'], cats)[0]).toMatchObject({ receitas: 0, despesas: 0, saldo: 0 })
  })
  it('50/30/20 usa a renda base do plano quando existe, senão as receitas do mês', () => {
    const plano = { necessidade: 0.5, desejo: 0.3, poupanca: 0.2 }
    const r = resumo503020(s[1], plano)
    expect(r.renda).toBe(5000)
    expect(r.classes[0]).toMatchObject({ classificacao: 'necessidade', total: 100.5, meta: 2500 })
    expect(resumo503020(s[1], { ...plano, renda_base: 8000 }).classes[1].meta).toBe(2400)
    expect(resumo503020(undefined, plano).classes[0].pct).toBe(0)
  })
})

describe('por categoria', () => {
  it('agrupa despesas, junta "sem categoria" e calcula a participação', () => {
    const r = byCategory([
      tx({ valor: 60, categoria_id: 'c-alimentacao' }), tx({ valor: 20, categoria_id: 'c-alimentacao' }),
      tx({ valor: 20, categoria_id: 'c-inexistente' }), tx({ valor: 100, tipo: 'receita' }),
    ], cats)
    expect(r.map(c => [c.id, c.valor, c.qtd])).toEqual([['c-alimentacao', 80, 2], [SEM_CATEGORIA, 20, 1]])
    expect(r[0].pct).toBeCloseTo(0.8)
  })
})

describe('filtro de despesas', () => {
  const txs = [
    tx({ descricao: 'Mercado Bom', categoria_id: 'c-alimentacao', account_id: 'a1' }),
    tx({ descricao: 'Cinema', categoria_id: 'c-lazer', account_id: 'a2' }),
    tx({ descricao: 'Padaria', categoria_id: null, account_id: 'a1' }),
    tx({ descricao: 'Antigo', data: '2026-01-01', categoria_id: 'c-lazer' }),
  ]
  const ids = (f: Parameters<typeof filterDespesas>[1]) => filterDespesas(txs, f, cats).map(t => t.descricao)
  it('por período, grupo, categoria, conta e busca sem acento', () => {
    expect(ids({ months: ['2026-10'] })).toEqual(['Mercado Bom', 'Cinema', 'Padaria'])
    expect(ids({ months: ['2026-10'], classe: 'desejo' })).toEqual(['Cinema'])
    expect(ids({ months: ['2026-10'], categoria: SEM_CATEGORIA })).toEqual(['Padaria'])
    expect(ids({ months: ['2026-10'], conta: 'a1' })).toEqual(['Mercado Bom', 'Padaria'])
    expect(ids({ months: ['2026-10'], busca: 'MERC' })).toEqual(['Mercado Bom'])
    expect(ids({ months: ['2026-01', '2026-10'], classe: 'desejo' })).toEqual(['Cinema', 'Antigo'])
  })
})

describe('acumulado diário', () => {
  const txs = [tx({ data: '2026-10-01', valor: 10 }), tx({ data: '2026-10-03', valor: 5 }), tx({ data: '2026-10-03', valor: 1, tipo: 'receita' })]
  it('acumula por dia e para no dia de hoje', () => {
    const c = dailyCumulative(txs, '2026-10', t => t.tipo === 'despesa' && t.status === 'confirmada')
    expect(c.slice(0, 4)).toEqual([10, 10, 15, 15])
    expect(c).toHaveLength(31)
    const ate = dailyCumulative(txs, '2026-10', t => t.tipo === 'despesa', 2)
    expect(ate.slice(0, 3)).toEqual([10, 10, null])
  })
})

describe('fontes de receita', () => {
  it('limpa datas, horas e prefixos para juntar a mesma fonte', () => {
    expect(fonteKey('Pix - Recebido - 02/01 14:30 EMPRESA EXEMPLO LTDA')).toBe('empresa exemplo ltda')
    expect(fonteKey('PIX RECEBIDO 05/02 09:00 EMPRESA EXEMPLO LTDA')).toBe('empresa exemplo ltda')
    expect(fonteKey('Crédito salário')).toBe('salario')
    expect(fonteKey('123')).toBe('outros')
  })
  it('agrupa, ordena e junta o restante em "Outras"', () => {
    const txs = [
      tx({ tipo: 'receita', valor: 3000, descricao: 'PIX RECEBIDO 05/02 EMPRESA EXEMPLO' }),
      tx({ tipo: 'receita', valor: 3000, descricao: 'Pix recebido 05/03 EMPRESA EXEMPLO' }),
      tx({ tipo: 'receita', valor: 100, descricao: 'Venda bicicleta' }),
      tx({ tipo: 'receita', valor: 50, descricao: 'Reembolso' }),
      tx({ tipo: 'despesa', valor: 9999, descricao: 'Mercado' }),
    ]
    const f = incomeSources(txs, 2)
    expect(f.map(x => [x.nome, x.valor, x.qtd])).toEqual([['Empresa Exemplo', 6000, 2], ['Venda Bicicleta', 100, 1], ['Outras', 50, 1]])
    expect(f[0].pct).toBeCloseTo(6000 / 6150)
  })
})

describe('lista por dia', () => {
  it('ordena do mais recente e soma por dia', () => {
    const g = groupByDay([tx({ data: '2026-10-01', valor: 1 }), tx({ data: '2026-10-05', valor: 2 }), tx({ data: '2026-10-05', valor: 3 })])
    expect(g.map(d => [d.data, d.itens.length, d.total])).toEqual([['2026-10-05', 2, 5], ['2026-10-01', 1, 1]])
  })
})

describe('mapa de calor e projeção', () => {
  it('soma por dia, conta lançamentos e guarda o maior', () => {
    const d = dailyTotals([
      tx({ data: '2026-10-02', valor: 10, descricao: 'A' }), tx({ data: '2026-10-02', valor: 30, descricao: 'B' }),
      tx({ data: '2026-10-05', valor: 5 }), tx({ data: '2026-10-05', valor: 99, tipo: 'receita' }),
    ], '2026-10', isDespesa)
    expect(d).toHaveLength(31)
    expect(d[1]).toMatchObject({ dia: 2, data: '2026-10-02', total: 40, qtd: 2, maior: { descricao: 'B', valor: 30 } })
    expect(d[4]).toMatchObject({ total: 5, qtd: 1 })
    expect(d[0]).toMatchObject({ total: 0, qtd: 0, maior: null })
  })
  it('primeiro dia da semana do mês', () => {
    expect(firstWeekday('2026-11')).toBe(0) // 01/11/2026 é domingo
    expect(firstWeekday('2026-10')).toBe(4) // 01/10/2026 é quinta
  })
  it('projeção linear até o fim do mês', () => {
    expect(projecaoFimDoMes(1000, 10, 30)).toBe(3000)
    expect(projecaoFimDoMes(1000, 0, 30)).toBe(0)
  })
})
