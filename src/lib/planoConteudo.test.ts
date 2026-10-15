import { describe, it, expect } from 'vitest'
// @ts-ignore: carregador em JavaScript puro, sem declaração de tipos
import { validarConteudo, montarConteudo } from '../../scripts/plano/carregar.mjs'
import { lerConteudo, lerDiagnostico, lerCorte, lerDividas, lerPendencias } from './planoConteudo'

// Fixture 100% sintética: nomes e valores inventados.
export const secoes = {
  diagnostico: {
    subtitulo: 'Renda sólida e uma agenda de parcelas que pesa no começo',
    renda: { total: 20000, partes: [{ rotulo: 'Pessoa A', valor: 14000 }, { rotulo: 'Pessoa B', valor: 6000 }], nota: 'sem 13º' },
    patrimonio: { total: 500000, partes: [{ rotulo: 'Imóvel', valor: 400000 }, { rotulo: 'Veículo', valor: 100000 }] },
    dividas: { total: 150000, partes: [{ rotulo: 'Banco X', valor: 100000 }, { rotulo: 'Banco Y', valor: 50000 }] },
    parcelas: { pctInicio: 40, rotuloInicio: 'out/26', valorInicio: 8000, pctFim: 20, rotuloFim: 'set/27', nota: 'conforme as parcelas terminam' },
    rodape: 'Sobre a renda após impostos.',
  },
  metodo: {
    blocos: [{ pct: '50%', titulo: 'Necessidades', descricao: 'Moradia' }, { pct: '30%', titulo: 'Desejos', descricao: 'Lazer' }, { pct: '25–30%', titulo: 'Futuro', descricao: 'Reserva' }],
    ordem: [{ titulo: 'Mini-reserva', descricao: 'Um mês de despesas' }, { titulo: 'Dívida mais cara', descricao: 'Quitar primeiro' }],
  },
  caixa: {
    entra: [{ rotulo: 'Pessoa A', valor: 14000 }, { rotulo: 'Pessoa B', valor: 6000 }],
    sai: [{ rotulo: 'Parcelas', valor: 8000 }, { rotulo: 'Essenciais', valor: 7000 }, { rotulo: 'Desejos', valor: 4500 }],
    rendaTipica: 19000,
    resultados: [{ rotulo: 'de folga com a renda de setembro', valor: 500 }, { rotulo: 'de resultado com a renda típica', valor: -500 }, { rotulo: 'por mês em desejos', valor: 4500 }],
    nota: 'Fora desta conta: movimentos entre contas.',
  },
  corte: {
    linhas: [
      { categoria: 'Compras', hoje: 2800, hojeNota: '29 compras por mês', teto: 2000, economia: 800, como: 'Teto semanal' },
      { categoria: 'Compras da Pessoa B', hoje: null, teto: null, tetoTexto: 'a definir', economia: 0, como: 'Medir primeiro' },
    ],
    totalHoje: 4500, totalTeto: 3700, resultadoAntes: -500, resultadoDepois: 300,
    fases: [{ periodo: 'out–dez/26', teto: 3700 }, { periodo: 'jan–jun/27', teto: 4000 }],
  },
  dividas: {
    itens: [
      { rotulo: 'Cartões (Pessoa B)', detalhe: 'R$ 3 mil por mês', fim: '2028-02-01', dono: 'Pessoa B', estimado: false },
      { rotulo: 'Veículo', detalhe: 'R$ 2 mil por mês', fim: '2031-03-01', dono: 'Pessoa A', estimado: true },
    ],
  },
}

describe('leitor do conteúdo', () => {
  it('aceita a fixture completa e preserva os valores', () => {
    const c = lerConteudo(Object.entries(secoes).map(([secao, dados]) => ({ secao, dados })))
    expect(c.diagnostico?.renda.total).toBe(20000)
    expect(c.diagnostico?.parcelas.pctFim).toBe(20)
    expect(c.metodo?.blocos).toHaveLength(3)
    expect(c.caixa?.resultados[1].valor).toBe(-500)
    expect(c.corte?.linhas[1].tetoTexto).toBe('a definir')
    expect(c.dividas?.itens[1].estimado).toBe(true)
  })

  it('seção ausente ou malformada vira null, sem quebrar as outras', () => {
    const c = lerConteudo([
      { secao: 'diagnostico', dados: { renda: { total: 'muito' } } },
      { secao: 'metodo', dados: secoes.metodo },
      { secao: 'dividas', dados: { itens: [{ rotulo: 'x', detalhe: 'y', fim: '2028-02-15', dono: 'z' }] } },
    ])
    expect(c.diagnostico).toBeNull()
    expect(c.metodo).not.toBeNull()
    expect(c.caixa).toBeNull()
    expect(c.dividas).toBeNull() // fim precisa ser o dia 1
  })

  it('rejeita números não finitos e listas com item inválido', () => {
    expect(lerDiagnostico({ ...secoes.diagnostico, renda: { total: Infinity, partes: [] } })).toBeNull()
    expect(lerCorte({ ...secoes.corte, linhas: [...secoes.corte.linhas, 'x'] })).toBeNull()
    expect(lerDividas({ itens: [] })).toBeNull()
  })

  it('ordena as pendências e normaliza valores desconhecidos', () => {
    const p = lerPendencias([
      { id: 'b', titulo: 'Segunda', ordem: 2, responsavel: 'arsen', status: 'resolvida', resposta: 'ok', respondido_em: '2026-10-09T10:00:00Z' },
      { id: 'a', titulo: 'Primeira', ordem: 1, responsavel: 'qualquer', status: 'estranho', detalhe: ' ' },
      { id: 'c', titulo: '' },
      null,
    ])
    expect(p.map(x => x.id)).toEqual(['a', 'b'])
    expect(p[0]).toMatchObject({ responsavel: 'casal', status: 'aberta', detalhe: null })
    expect(p[1]).toMatchObject({ responsavel: 'arsen', status: 'resolvida', resposta: 'ok' })
  })
})

describe('o carregador e o aplicativo concordam', () => {
  it('a fixture passa nos dois lados', () => {
    expect(validarConteudo({ secoes })).toEqual([])
    const c = lerConteudo(Object.entries(secoes).map(([secao, dados]) => ({ secao, dados })))
    expect(Object.values(c).every(v => v !== null)).toBe(true)
  })

  it('o que o carregador recusa, o aplicativo também não mostraria', () => {
    const quebras: Record<string, any> = {
      diagnostico: { ...secoes.diagnostico, parcelas: { pctInicio: 40 } },
      metodo: { blocos: [], ordem: [] },
      caixa: { ...secoes.caixa, entra: [{ rotulo: 'A', valor: 'x' }] },
      corte: { ...secoes.corte, fases: [{ periodo: '', teto: 1 }] },
      dividas: { itens: [{ rotulo: 'a', detalhe: 'b', fim: '2028-02-10', dono: 'c' }] },
    }
    for (const [nome, dados] of Object.entries(quebras)) {
      expect(validarConteudo({ secoes: { [nome]: dados } }).join(), nome).toMatch(/formato inválido/)
      const lido = lerConteudo([{ secao: nome, dados }]) as unknown as Record<string, unknown>
      expect(lido[nome], nome).toBeNull()
    }
  })
})

describe('montarConteudo', () => {
  const pendencias = [
    { titulo: 'Qual é o destino das transferências?', detalhe: 'Detalhe', responsavel: 'casal', ordem: 1 },
    { titulo: 'Cartão do pagamento de fatura', responsavel: 'arsen', ordem: 2 },
  ]
  it('valida pendências: título repetido, responsável e ordem', () => {
    const e = validarConteudo({ pendencias: [{ titulo: 'a', responsavel: 'casal', ordem: 1 }, { titulo: 'a', responsavel: 'outro', ordem: 'x' }] }).join('\n')
    expect(e).toMatch(/título repetido/)
    expect(e).toMatch(/responsavel deve ser casal ou arsen/)
    expect(e).toMatch(/ordem deve ser inteiro/)
    expect(validarConteudo({})).toEqual(['o arquivo não tem seções nem pendências'])
    expect(validarConteudo({ secoes: { inventada: {} } }).join()).toMatch(/seção desconhecida/)
  })

  it('insere o que é novo e atualiza só os campos da Arsen, sem tocar na resposta do casal', () => {
    const r = montarConteudo({ secoes, pendencias }, 'h-1', [{ id: 'p-1', titulo: 'Qual é o destino das transferências?' }, { id: 'p-9', titulo: 'Item antigo' }])
    expect(r.secoes.map((s: any) => s.secao).sort()).toEqual(['caixa', 'corte', 'diagnostico', 'dividas', 'metodo'])
    expect(r.inserir).toHaveLength(1)
    expect(r.inserir[0]).toMatchObject({ household_id: 'h-1', titulo: 'Cartão do pagamento de fatura', status: 'aberta' })
    expect(r.atualizar).toEqual([{ id: 'p-1', titulo: 'Qual é o destino das transferências?', detalhe: 'Detalhe', responsavel: 'casal', ordem: 1 }])
    expect(Object.keys(r.atualizar[0])).not.toContain('resposta')
    expect(r.naoNoArquivo).toEqual(['Item antigo'])
  })
})
