import { describe, it, expect } from 'vitest'
import {
  matchBatchTransactions, buildBatchReport, buildOrphanReport, buildAssignments, simplifyFonte, buildFonteReport, accountForBatch, proposeTransfers, validateProposal, buildUpdates,
} from './plan.mjs'

// Dados 100% sintéticos.
const U1 = 'u1', U2 = 'u2'
const batch = { id: 'b1', user_id: U1, created_at: '2026-09-20T12:00:30Z', quantidade: 3, fonte: 'Banco Alfa', account_id: null,
  periodo_inicio: '2026-09-01', periodo_fim: '2026-09-30' }
const mk = (id, over = {}) => ({
  id, user_id: U1, origem: 'pdf', account_id: null, import_batch_id: null, status: 'confirmada',
  created_at: '2026-09-20T12:00:20Z', data: '2026-09-10', tipo: 'despesa', valor: 10, descricao: 'COMPRA', ...over,
})

describe('vínculo de lotes por horário', () => {
  const txs = [mk('t1'), mk('t2'), mk('t3'),
    mk('velho', { created_at: '2026-08-01T12:00:00Z' }),
    mk('outro-user', { user_id: U2 }),
    mk('manual', { origem: 'manual' }),
    mk('ja-vinculado', { account_id: 'a1' })]
  it('pega só pdf, sem conta, do mesmo usuário e na janela', () => {
    expect(matchBatchTransactions(batch, txs).map(t => t.id)).toEqual(['t1', 't2', 't3'])
  })
  it('relatório marca contagem exata', () => {
    expect(buildBatchReport([batch], txs)).toEqual([expect.objectContaining({ id: 'b1', encontrados: 3, exato: true })])
    expect(buildBatchReport([{ ...batch, quantidade: 5 }], txs)[0].exato).toBe(false)
  })
  it('lote que já tem conta não entra no relatório', () => {
    expect(buildBatchReport([{ ...batch, account_id: 'a1' }], txs)).toEqual([])
  })
  it('atribui só lotes mapeados com contagem exata; os demais são pulados com motivo', () => {
    const ok = buildAssignments([batch], txs, { b1: 'a1' })
    expect([...ok.assigned.keys()]).toEqual(['t1', 't2', 't3'])
    expect(ok.assigned.get('t1')).toEqual({ accountId: 'a1', batchId: 'b1' })
    const bad = buildAssignments([{ ...batch, quantidade: 5 }], txs, { b1: 'a1' })
    expect(bad.assigned.size).toBe(0)
    expect(bad.skipped[0].motivo).toMatch(/esperado 5, encontrado 3/)
    expect(buildAssignments([batch], txs, {}).assigned.size).toBe(0)
  })
})

describe('proposta de transferências', () => {
  const accounts = [
    { id: 'a-corr', instituicao: 'Banco Alfa', apelido: 'Corrente', tipo: 'corrente', owner_user_id: U1 },
    { id: 'a-poup', instituicao: 'Banco Beta', apelido: 'Poupança', tipo: 'poupanca', owner_user_id: U1 },
    { id: 'a-card', instituicao: 'Nubank', apelido: 'Cartão', tipo: 'cartao', owner_user_id: U1 },
  ]
  const people = [{ userId: U1, nome: 'Ana Exemplo Silva' }, { userId: U2, nome: 'Bruno Exemplo Silva' }]
  const txs = [
    mk('s', { descricao: 'PIX ENVIADO ANA EXEMPLO SILVA', valor: 300, account_id: 'a-corr' }),
    mk('e', { descricao: 'PIX RECEBIDO', tipo: 'receita', valor: 300, account_id: 'a-poup', data: '2026-09-11' }),
    mk('fat', { descricao: 'PIX ENVIADO NU PAGAMENTOS', valor: 900, account_id: 'a-corr' }),
    mk('conj', { descricao: 'PIX ENVIADO BRUNO', valor: 50, account_id: 'a-corr' }),
    mk('mercado', { descricao: 'COMPRA SUPERMERCADO', valor: 80, account_id: 'a-corr' }),
    mk('sem-conta', { descricao: 'PIX ENVIADO ANA EXEMPLO SILVA', valor: 5 }),
  ]
  const itens = proposeTransfers({ txs, assigned: new Map(), accounts, people })
  const by = id => itens.find(i => i.id === id)

  it('par entre contas vem aprovado e com o mesmo pairId', () => {
    expect(by('s')).toMatchObject({ kind: 'entre_contas', aprovado: true })
    expect(by('s').pairId).toBeTruthy()
    expect(by('s').pairId).toBe(by('e').pairId)
  })
  it('pagamento de fatura aprovado; cônjuge só pelo primeiro nome vem reprovado (ambíguo)', () => {
    expect(by('fat')).toMatchObject({ kind: 'pagamento_fatura', aprovado: true })
    expect(by('conj')).toMatchObject({ status: 'ambigua', aprovado: false })
  })
  it('compra comum e lançamento sem conta ficam de fora', () => {
    expect(by('mercado')).toBeUndefined()
    expect(by('sem-conta')).toBeUndefined()
  })
  it('usa a conta que o lote mapeado atribuiria', () => {
    const assigned = new Map([['sem-conta', { accountId: 'a-corr', batchId: 'b1' }]])
    const r = proposeTransfers({ txs, assigned, accounts, people })
    expect(r.find(i => i.id === 'sem-conta')).toMatchObject({ kind: 'entre_contas' })
  })
  it('validação exige as duas pontas do par juntas', () => {
    expect(validateProposal(itens)).toEqual([])
    const torto = itens.map(i => (i.id === 'e' ? { ...i, aprovado: false } : i))
    expect(validateProposal(torto)[0]).toMatch(/aprove as duas pontas/)
  })
  it('updates: direção correta e só itens aprovados', () => {
    const { transferUpdates } = buildUpdates({ batches: [], assigned: new Map(), itens })
    const s = transferUpdates.find(u => u.id === 's')
    const e = transferUpdates.find(u => u.id === 'e')
    expect(s.set).toMatchObject({ tipo: 'transferencia', transfer_direction: 'saida' })
    expect(e.set.transfer_direction).toBe('entrada')
    expect(transferUpdates.find(u => u.id === 'conj')).toBeUndefined()
    expect(s.expectedTipo).toBe('despesa')
  })
  it('updates de lote agrupam lançamentos por lote', () => {
    const assigned = new Map([['t1', { accountId: 'a1', batchId: 'b1' }], ['t2', { accountId: 'a1', batchId: 'b1' }]])
    const { batchUpdates } = buildUpdates({ batches: [batch], assigned, itens: [] })
    expect(batchUpdates).toEqual([{ batchId: 'b1', accountId: 'a1', txIds: ['t1', 't2'] }])
  })
})

describe('grupos de lançamentos sem lote', () => {
  const orf = [
    mk('p1', { created_at: '2026-09-29T10:00:00Z', data: '2026-09-01' }),
    mk('p2', { created_at: '2026-09-29T10:00:05Z', data: '2026-09-20', tipo: 'receita' }),
    mk('p3', { created_at: '2026-09-30T08:00:00Z' }),
    mk('m1', { origem: 'manual', created_at: '2026-09-25T10:00:00Z' }),
    mk('m2', { origem: 'manual', created_at: '2026-10-01T10:00:00Z' }),
    mk('com-conta', { account_id: 'a1', created_at: '2026-09-29T10:00:00Z' }),
    mk('com-lote', { import_batch_id: 'b9', created_at: '2026-09-29T10:00:00Z' }),
  ]
  it('agrupa por origem e dia da gravação; manuais ficam juntos; ignora quem já tem conta ou lote', () => {
    expect(buildOrphanReport(orf)).toEqual([
      { chave: 'manual|*', origem: 'manual', quantidade: 2, data_min: '2026-09-10', data_max: '2026-09-10', despesas: 2, receitas: 0 },
      { chave: 'pdf|2026-09-29', origem: 'pdf', quantidade: 2, data_min: '2026-09-01', data_max: '2026-09-20', despesas: 1, receitas: 1 },
      { chave: 'pdf|2026-09-30', origem: 'pdf', quantidade: 1, data_min: '2026-09-10', data_max: '2026-09-10', despesas: 1, receitas: 0 },
    ])
  })
  it('mapear um grupo atribui só a conta, sem lote', () => {
    const { assigned } = buildAssignments([], orf, { 'pdf|2026-09-29': 'a1', 'pdf|2026-09-30': null })
    expect([...assigned.keys()].sort()).toEqual(['p1', 'p2'])
    expect(assigned.get('p1')).toEqual({ accountId: 'a1', batchId: null })
  })
  it('updates agrupam por conta com batchId nulo', () => {
    const { assigned } = buildAssignments([], orf, { 'pdf|2026-09-29': 'a1' })
    const { batchUpdates } = buildUpdates({ batches: [], assigned, itens: [] })
    expect(batchUpdates).toEqual([{ batchId: null, accountId: 'a1', txIds: ['p1', 'p2'] }])
  })
})

describe('vínculo sequencial (importação em massa)', () => {
  // Três lotes criados em sequência, em poucos minutos: cada lote fica logo depois dos seus lançamentos.
  const at = sec => `2026-09-28T10:00:${String(sec).padStart(2, '0')}Z`
  const lotes = [
    { id: 'L1', user_id: U1, created_at: at(10), quantidade: 2, fonte: 'Nubank', account_id: null },
    { id: 'L2', user_id: U1, created_at: at(20), quantidade: 3, fonte: 'Banco do Brasil – Conta 27517-4', account_id: null },
    { id: 'L3', user_id: U1, created_at: at(30), quantidade: 1, fonte: 'Cartão XP', account_id: null },
  ]
  const txs = [
    mk('a1', { created_at: at(1) }), mk('a2', { created_at: at(2) }),
    mk('b1', { created_at: at(11) }), mk('b2', { created_at: at(12) }), mk('b3', { created_at: at(13) }),
    mk('c1', { created_at: at(21) }),
  ]
  it('cada lote pega só o que foi gravado entre o lote anterior e ele (sem vazar para vizinhos)', () => {
    expect(matchBatchTransactions(lotes[0], txs, lotes).map(t => t.id)).toEqual(['a1', 'a2'])
    expect(matchBatchTransactions(lotes[1], txs, lotes).map(t => t.id)).toEqual(['b1', 'b2', 'b3'])
    expect(matchBatchTransactions(lotes[2], txs, lotes).map(t => t.id)).toEqual(['c1'])
    expect(buildBatchReport(lotes, txs).every(r => r.exato)).toBe(true)
  })
  it('lotes de outro usuário não cortam a sequência', () => {
    const outros = [...lotes, { id: 'X', user_id: U2, created_at: at(11), quantidade: 0, fonte: 'Y', account_id: null }]
    expect(matchBatchTransactions(lotes[1], txs, outros).map(t => t.id)).toEqual(['b1', 'b2', 'b3'])
  })
  it('lançamento sem lote correspondente (importação que falhou) quebra a contagem em vez de passar', () => {
    const sobra = [...txs, mk('orfao', { created_at: at(15) })]
    expect(buildBatchReport(lotes, sobra).find(r => r.id === 'L2')).toMatchObject({ encontrados: 4, exato: false })
  })
})

describe('regras por fonte', () => {
  const lotes = [
    { id: 'L1', user_id: U1, created_at: '2026-09-28T10:00:10Z', quantidade: 1, fonte: 'Extrato BB Conta Corrente 01/2026', account_id: null },
    { id: 'L2', user_id: U1, created_at: '2026-09-28T10:00:20Z', quantidade: 1, fonte: 'Banco do Brasil – Conta 27517-4', account_id: null },
    { id: 'L3', user_id: U1, created_at: '2026-09-28T10:00:30Z', quantidade: 1, fonte: 'Fatura Santander Elite Mastercard 09/2026', account_id: null },
  ]
  it('simplifica a fonte: sem mês/ano, sem Extrato/Fatura, sem acento', () => {
    expect(simplifyFonte('Fatura Santander Elite Mastercard 09/2026')).toBe('SANTANDER ELITE MASTERCARD')
    expect(simplifyFonte('Banco do Brasil – Conta Corrente 27517-4')).toBe('BANCO DO BRASIL CONTA CORRENTE 27517 4')
    expect(simplifyFonte('Caixa Econômica Federal')).toBe('CAIXA ECONOMICA FEDERAL')
  })
  it('relatório agrupa fontes iguais depois de simplificar', () => {
    const r = buildFonteReport([...lotes, { ...lotes[2], id: 'L4', fonte: 'Fatura Santander Elite Mastercard 08/2026', quantidade: 4 }])
    expect(r.find(x => x.fonte === 'SANTANDER ELITE MASTERCARD')).toEqual({ fonte: 'SANTANDER ELITE MASTERCARD', lotes: 2, lancamentos: 5 })
  })
  it('regra casa por trecho; id explícito vence; sem regra não vincula', () => {
    const mapping = { 'fonte~27517': 'a-bb', 'fonte~santander': 'a-sant', 'L2': 'a-outra', 'fonte~vazio': null }
    expect(accountForBatch(lotes[1], mapping)).toBe('a-outra')
    expect(accountForBatch(lotes[2], mapping)).toBe('a-sant')
    expect(accountForBatch(lotes[0], mapping)).toBeNull()
    expect(accountForBatch(lotes[0], { 'fonte~extrato bb': 'a-bb' })).toBe('a-bb')
  })
})
