import { describe, it, expect } from 'vitest'
import { validarPlano, montarCarga, resumoCarga } from './carregar.mjs'

// Fixture 100% sintética.
const valores = (v, n = 12) => Array.from({ length: n }, () => v)
const base = () => ({
  config: { inicio: '2026-10-01', meses: 12, reserva_saldo: 1000, pct_reserva: 1, meta_reserva_meses: 6, renda_ajuste_holerite: 300 },
  linhas: [
    { chave: 'renda', rotulo: 'Renda', grupo: 'receita', categoria_ids: [], rastreavel: true, ordem: 1, valores: valores(10000) },
    { chave: 'moradia', rotulo: 'Moradia', grupo: 'necessidade', categoria_ids: ['c-moradia'], rastreavel: true, ordem: 2, valores: valores(3000) },
    { chave: 'financ', rotulo: 'Financiamento', grupo: 'divida', categoria_ids: [], rastreavel: false, ordem: 3, valores: valores(1000) },
    { chave: 'rest', rotulo: 'Restaurantes', grupo: 'desejo', categoria_ids: ['c-restaurante'], rastreavel: true, sem_corte: 800, ordem: 4, valores: valores(500) },
  ],
})

describe('validarPlano', () => {
  it('aceita um plano consistente (receita e despesa podem repetir a categoria)', () => {
    expect(validarPlano(base())).toEqual([])
  })

  it('recusa início fora do dia 1, quantidade de valores errada e grupo inválido', () => {
    const p = base()
    p.config.inicio = '2026-10-15'
    p.linhas[1].valores = valores(3000, 11)
    p.linhas[2].grupo = 'outro'
    const e = validarPlano(p).join('\n')
    expect(e).toMatch(/inicio/)
    expect(e).toMatch(/12 números/)
    expect(e).toMatch(/grupo inválido/)
  })

  it('recusa categoria desconhecida e linha rastreável sem categoria', () => {
    const p = base()
    p.linhas[1].categoria_ids = ['c-inventada']
    p.linhas[3].categoria_ids = []
    const e = validarPlano(p).join('\n')
    expect(e).toMatch(/categoria desconhecida c-inventada/)
    expect(e).toMatch(/pelo menos uma categoria/)
  })

  it('recusa duas linhas de despesa na mesma categoria e chave repetida', () => {
    const p = base()
    p.linhas.push({ chave: 'moradia', rotulo: 'x', grupo: 'desejo', categoria_ids: ['c-moradia'], rastreavel: true, ordem: 5, valores: valores(1) })
    p.linhas.push({ chave: 'outra', rotulo: 'y', grupo: 'desejo', categoria_ids: ['c-moradia'], rastreavel: true, ordem: 6, valores: valores(1) })
    const e = validarPlano(p).join('\n')
    expect(e).toMatch(/chave repetida/)
    expect(e).toMatch(/contado duas vezes/)
  })

  it('recusa despesa negativa e percentual fora da faixa', () => {
    const p = base()
    p.linhas[1].valores[3] = -1
    p.config.pct_reserva = 1.5
    const e = validarPlano(p).join('\n')
    expect(e).toMatch(/negativos/)
    expect(e).toMatch(/pct_reserva/)
  })

  it('recusa categorias na receita e mais de uma receita rastreável', () => {
    const p = base()
    p.linhas[0].categoria_ids = ['c-moradia']
    p.linhas.push({ chave: 'renda2', rotulo: 'Renda 2', grupo: 'receita', categoria_ids: [], rastreavel: true, ordem: 9, valores: valores(1) })
    const e = validarPlano(p).join('\n')
    expect(e).toMatch(/receita não usa categorias/)
    expect(e).toMatch(/só pode haver uma linha de receita rastreável/)
  })

  it('exige uma linha de receita', () => {
    const p = base()
    p.linhas = p.linhas.slice(1)
    expect(validarPlano(p).join('\n')).toMatch(/receita/)
  })
})

describe('montarCarga', () => {
  it('gera um valor por linha e mês, com meses consecutivos atravessando o ano', () => {
    let n = 0
    const c = montarCarga(base(), 'h-1', new Map(), () => `id-${++n}`)
    expect(c.linhas).toHaveLength(4)
    expect(c.valores).toHaveLength(4 * 12)
    const meses = c.valores.filter(v => v.linha_id === 'id-1').map(v => v.mes)
    expect(meses[0]).toBe('2026-10-01')
    expect(meses[3]).toBe('2027-01-01')
    expect(meses[11]).toBe('2027-09-01')
    expect(c.valores.every(v => v.household_id === 'h-1')).toBe(true)
  })

  it('reaproveita o id das linhas existentes (carga repetível)', () => {
    const c = montarCarga(base(), 'h-1', new Map([['moradia', 'id-existente']]), () => 'novo')
    expect(c.linhas.find(l => l.chave === 'moradia').id).toBe('id-existente')
    expect(c.valores.filter(v => v.linha_id === 'id-existente')).toHaveLength(12)
  })
})

describe('resumoCarga', () => {
  it('resume sem expor valores por linha', () => {
    const r = resumoCarga(base())
    expect(r.linhas).toBe(4)
    expect(r.naoRastreaveis).toEqual(['financ'])
    expect(r.folgaMedia12m).toBe(10000 - 3000 - 1000 - 500)
    expect(Object.keys(r)).not.toContain('valores')
  })
})
