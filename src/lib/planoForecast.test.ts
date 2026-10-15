import { describe, it, expect } from 'vitest'
import {
  addMeses, mesCorrente, mesesFechadosEmSequencia, projetar, compararCenarios, desejosDoMes,
  historicoFechado, realizadoDaLinha, realizadoSemLinha, categoriasDuplicadas,
  type PlanoEntrada, type PlanoLinha, type PlanoValores, type RealizadoRow,
} from './planoForecast'

// Fixture 100% sintética: nomes de linha e valores são inventados.
const linhas: PlanoLinha[] = [
  { id: 'l-renda', chave: 'renda', rotulo: 'Renda', grupo: 'receita', categoriaIds: [], rastreavel: true, semCorte: null, ordem: 1 },
  { id: 'l-mor', chave: 'moradia', rotulo: 'Moradia', grupo: 'necessidade', categoriaIds: ['c-moradia'], rastreavel: true, semCorte: null, ordem: 2 },
  { id: 'l-fin', chave: 'financiamento', rotulo: 'Financiamento', grupo: 'divida', categoriaIds: [], rastreavel: false, semCorte: null, ordem: 3 },
  { id: 'l-rest', chave: 'restaurantes', rotulo: 'Restaurantes', grupo: 'desejo', categoriaIds: ['c-restaurante'], rastreavel: true, semCorte: 800, ordem: 4 },
  { id: 'l-comp', chave: 'compras', rotulo: 'Compras', grupo: 'desejo', categoriaIds: ['c-compras'], rastreavel: true, semCorte: 1500, ordem: 5 },
  { id: 'l-prev', chave: 'previdencia', rotulo: 'Previdência', grupo: 'futuro', categoriaIds: ['c-previdencia'], rastreavel: true, semCorte: null, ordem: 6 },
]

const planoMensal: Record<string, number> = { 'l-renda': 10000, 'l-mor': 3000, 'l-fin': 1000, 'l-rest': 500, 'l-comp': 1000, 'l-prev': 500 }

function valores(meses = 24, inicio = '2026-10-01'): PlanoValores {
  const v: PlanoValores = {}
  for (const [id, val] of Object.entries(planoMensal)) {
    v[id] = {}
    for (let i = 0; i < meses; i++) v[id][addMeses(inicio, i)] = val
  }
  return v
}

const entrada = (p: Partial<PlanoEntrada> = {}): PlanoEntrada => ({
  config: { inicio: '2026-10-01', meses: 24, reservaSaldo: 5000, pctReserva: 1, metaReservaMeses: 6, rendaAjusteHolerite: 500, metaBaseExtra: 0 },
  linhas,
  valores: valores(),
  realizado: [],
  fechados: [],
  ...p,
})

const row = (mes: string, categoria_id: string | null, tipo: 'despesa' | 'receita', total: number): RealizadoRow => ({ mes, categoria_id, tipo, total })

describe('meses', () => {
  it('soma meses atravessando o ano', () => {
    expect(addMeses('2026-10-01', 3)).toBe('2027-01-01')
    expect(addMeses('2027-01-01', -1)).toBe('2026-12-01')
    expect(addMeses('2026-10-01', 24)).toBe('2028-10-01')
  })

  it('mês corrente é o primeiro não fechado e só avança em sequência', () => {
    const c = entrada().config
    expect(mesCorrente(c, []).mes).toBe('2026-10-01')
    expect(mesCorrente(c, ['2026-10-01']).mes).toBe('2026-11-01')
    // fechar dezembro sem novembro não pula nada
    expect(mesCorrente(c, ['2026-10-01', '2026-12-01']).mes).toBe('2026-11-01')
    expect(mesesFechadosEmSequencia(c, ['2026-10-01', '2026-12-01'])).toEqual(['2026-10-01'])
  })

  it('com o plano todo fechado fica no último mês e marca completo', () => {
    const c = { ...entrada().config, meses: 12 }
    const todos = Array.from({ length: 12 }, (_, i) => addMeses('2026-10-01', i))
    expect(mesCorrente(c, todos)).toEqual({ mes: '2027-09-01', completo: true })
  })
})

describe('projeção', () => {
  it('cenário plano: janela de 12 meses a partir do mês corrente', () => {
    const p = projetar(entrada(), 'plano', 'tipica')
    expect(p.mesCorrente).toBe('2026-10-01')
    expect(p.janela).toHaveLength(12)
    const m = p.janela[0]
    expect(m.receita).toBe(10000)
    expect(m.despesas).toBe(3000 + 1000 + 500 + 1000 + 500)
    expect(m.folga).toBe(4000)
    expect(m.reservaFim).toBe(5000 + 4000)
    expect(m.metaReserva).toBe(6 * (3000 + 1000))
    expect(p.janela[11].reservaFim).toBe(5000 + 4000 * 12)
  })

  it('a meta da reserva inclui as necessidades descontadas em folha', () => {
    const e = entrada({ config: { ...entrada().config, metaBaseExtra: 1000 } })
    expect(projetar(e, 'plano', 'tipica').janela[0].metaReserva).toBe(6 * (3000 + 1000 + 1000))
  })

  it('a janela anda com o mês corrente e encolhe no fim do plano', () => {
    const fechados = Array.from({ length: 16 }, (_, i) => addMeses('2026-10-01', i))
    const p = projetar(entrada({ fechados }), 'plano', 'tipica')
    expect(p.mesCorrente).toBe('2028-02-01')
    expect(p.janela).toHaveLength(8) // fev a set/28
    expect(p.janela[7].mes).toBe('2028-09-01')
  })

  it('sem o corte usa o patamar anterior dos desejos', () => {
    const p = projetar(entrada(), 'sem_corte', 'tipica')
    expect(p.janela[0].desejo).toBe(800 + 1500)
    expect(p.janela[0].folga).toBe(10000 - (3000 + 1000 + 500 + 2300))
  })

  it('base de renda holerite soma o ajuste mensal', () => {
    const p = projetar(entrada(), 'plano', 'holerite')
    expect(p.janela[0].receita).toBe(10500)
  })

  it('ritmo atual usa a média dos últimos 3 meses fechados e cai no plano sem histórico', () => {
    const semHist = projetar(entrada(), 'ritmo', 'tipica')
    expect(semHist.janela[0].desejo).toBe(1500) // plano

    const fechados = ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']
    const realizado = [
      row('2026-10-01', 'c-restaurante', 'despesa', 9999), // fora dos últimos 3
      row('2026-11-01', 'c-restaurante', 'despesa', 600),
      row('2026-12-01', 'c-restaurante', 'despesa', 900),
      row('2027-01-01', 'c-restaurante', 'despesa', 1200),
      row('2026-11-01', 'c-moradia', 'despesa', 3300),
      row('2026-12-01', 'c-moradia', 'despesa', 3300),
      row('2027-01-01', 'c-moradia', 'despesa', 3300),
    ]
    const p = projetar(entrada({ fechados, realizado }), 'ritmo', 'tipica')
    expect(p.mesCorrente).toBe('2027-02-01')
    const m = p.janela[0]
    expect(m.porLinha.restaurantes).toBeCloseTo(900)
    expect(m.porLinha.moradia).toBeCloseTo(3300)
    // compras sem realizado em 3 meses fechados = média 0
    expect(m.porLinha.compras).toBe(0)
    // dívida não rastreável segue o plano
    expect(m.porLinha.financiamento).toBe(1000)

    const p10 = projetar(entrada({ fechados, realizado }), 'ritmo_10', 'tipica')
    expect(p10.janela[0].porLinha.restaurantes).toBeCloseTo(990)
    expect(p10.janela[0].porLinha.financiamento).toBe(1000)
  })

  it('base realizada usa a média da renda dos meses fechados', () => {
    const fechados = ['2026-10-01', '2026-11-01']
    const realizado = [row('2026-10-01', null, 'receita', 9000), row('2026-11-01', null, 'receita', 11000)]
    const p = projetar(entrada({ fechados, realizado }), 'plano', 'realizada')
    expect(p.janela[0].receita).toBe(10000)
    const sem = projetar(entrada(), 'plano', 'realizada')
    expect(sem.janela[0].receita).toBe(10000) // sem histórico: plano
  })

  it('aporte da reserva respeita o percentual e nunca é negativo', () => {
    const e = entrada({ config: { ...entrada().config, pctReserva: 0.5 } })
    expect(projetar(e, 'plano', 'tipica').janela[0].aporte).toBe(2000)

    const apertado = entrada({ valores: { ...valores(), 'l-renda': Object.fromEntries(Array.from({ length: 24 }, (_, i) => [addMeses('2026-10-01', i), 5000])) } })
    const m = projetar(apertado, 'plano', 'tipica').janela[0]
    expect(m.folga).toBeLessThan(0)
    expect(m.aporte).toBe(0)
    expect(m.reservaFim).toBe(5000)
  })
})

describe('comparação de cenários', () => {
  it('ordena a folga: plano ≥ sem corte e ritmo +10% ≤ ritmo', () => {
    const fechados = ['2026-10-01', '2026-11-01']
    const realizado = [
      row('2026-10-01', 'c-restaurante', 'despesa', 700), row('2026-11-01', 'c-restaurante', 'despesa', 700),
      row('2026-10-01', 'c-compras', 'despesa', 1400), row('2026-11-01', 'c-compras', 'despesa', 1400),
      row('2026-10-01', 'c-moradia', 'despesa', 3000), row('2026-11-01', 'c-moradia', 'despesa', 3000),
    ]
    const r = compararCenarios(entrada({ fechados, realizado }), 'tipica')
    const por = Object.fromEntries(r.map(x => [x.cenario, x]))
    expect(por.plano.folgaMedia).toBeGreaterThan(por.sem_corte.folgaMedia)
    expect(por.ritmo.folgaMedia).toBeGreaterThan(por.ritmo_10.folgaMedia)
  })

  it('informa em quantos meses a reserva alcança a meta', () => {
    const e = entrada({ config: { ...entrada().config, reservaSaldo: 20000 } })
    const r = compararCenarios(e, 'tipica').find(x => x.cenario === 'plano')!
    // meta 24.000; saldo 20.000 + 4.000 no 1º mês = 24.000
    expect(r.mesesAteMeta).toBe(1)
    expect(r.mesDaMeta).toBe('2026-10-01')
    const distante = entrada({ config: { ...entrada().config, metaReservaMeses: 24 } })
    const longe = compararCenarios(distante, 'tipica').find(x => x.cenario === 'plano')!
    expect(longe.mesesAteMeta).toBeNull()
  })
})

describe('realizado', () => {
  it('soma só a categoria e o tipo da linha, no mês certo', () => {
    const rows = [
      row('2026-10-01', 'c-restaurante', 'despesa', 100),
      row('2026-10-01', 'c-restaurante', 'despesa', 50),
      row('2026-11-01', 'c-restaurante', 'despesa', 70),
      row('2026-10-01', 'c-restaurante', 'receita', 999),
      row('2026-10-01', null, 'despesa', 30),
    ]
    const l = linhas.find(x => x.chave === 'restaurantes')!
    expect(realizadoDaLinha(l, '2026-10-01', rows)).toBe(150)
  })

  it('receita sem categoria entra na linha de receita e não sobra como receita sem linha', () => {
    const rows = [row('2026-10-01', null, 'receita', 7000), row('2026-10-01', 'c-lazer', 'receita', 500)]
    expect(realizadoDaLinha(linhas[0], '2026-10-01', rows)).toBe(7500)
    expect(realizadoSemLinha(linhas, '2026-10-01', rows).receita).toBe(0)
  })

  it('despesa sem linha aparece à parte', () => {
    const rows = [row('2026-10-01', 'c-lazer', 'despesa', 200), row('2026-10-01', null, 'despesa', 30), row('2026-10-01', 'c-moradia', 'despesa', 3000)]
    expect(realizadoSemLinha(linhas, '2026-10-01', rows)).toEqual({ despesa: 230, receita: 0 })
  })

  it('histórico fechado compara realizado com plano e usa o plano nas linhas não rastreáveis', () => {
    const realizado = [
      row('2026-10-01', null, 'receita', 9500),
      row('2026-10-01', 'c-moradia', 'despesa', 3200),
      row('2026-10-01', 'c-restaurante', 'despesa', 900),
      row('2026-10-01', 'c-lazer', 'despesa', 100),
    ]
    const h = historicoFechado(entrada({ fechados: ['2026-10-01'], realizado }))
    expect(h).toHaveLength(1)
    expect(h[0].receitaReal).toBe(9500)
    expect(h[0].despesaPlano).toBe(6000)
    // 3200 + 900 + 100 (sem linha) + financiamento do plano 1000 + compras 0 + previdência 0
    expect(h[0].despesaReal).toBe(3200 + 900 + 100 + 1000)
  })
})

describe('desejos do mês', () => {
  it('compara com o teto e extrapola o ritmo quando o mês é o de hoje', () => {
    const realizado = [row('2026-10-01', 'c-restaurante', 'despesa', 250)]
    const d = desejosDoMes(entrada({ realizado }), '2026-10-01', new Date(2026, 9, 10))
    const rest = d.find(x => x.chave === 'restaurantes')!
    expect(rest.teto).toBe(500)
    expect(rest.realizado).toBe(250)
    expect(rest.pct).toBe(0.5)
    expect(rest.projetado).toBeCloseTo((250 / 10) * 31)
    // mês de outro período: sem extrapolação
    const fora = desejosDoMes(entrada({ realizado }), '2026-10-01', new Date(2026, 10, 5))
    expect(fora.find(x => x.chave === 'restaurantes')!.projetado).toBe(250)
  })
})

describe('integridade do mapa', () => {
  it('detecta categoria usada por duas linhas', () => {
    expect(categoriasDuplicadas(linhas)).toEqual([])
    const dup = [...linhas, { ...linhas[3], id: 'l-x', chave: 'outra', categoriaIds: ['c-restaurante'] }]
    expect(categoriasDuplicadas(dup)).toEqual(['c-restaurante'])
  })
})
