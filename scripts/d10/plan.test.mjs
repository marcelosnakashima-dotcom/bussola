import { describe, it, expect } from 'vitest'
import {
  matchBatchTransactions, buildBatchReport, buildAssignments, proposeTransfers, validateProposal, buildUpdates,
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
