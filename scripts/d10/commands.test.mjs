import { describe, it, expect } from 'vitest'
import { cmdLotes, cmdPropor, cmdAplicar, cmdContas, cmdReverter } from './commands.mjs'

// Banco falso em memória, com as mesmas guardas do adaptador real.
function fakeDb(seed) {
  const state = structuredClone(seed)
  const db = {
    state,
    async loadContext() { return structuredClone({ accounts: state.accounts, batches: state.batches, txs: state.txs, people: state.people }) },
    async createAccounts(h, contas) {
      const novas = contas.map((c, i) => ({ id: `novo-${state.accounts.length + i}`, ativo: true, ...c }))
      state.accounts.push(...novas)
      return novas
    },
    async linkTransactions(h, ids, { accountId, batchId }) {
      let n = 0
      for (const t of state.txs) if (ids.includes(t.id) && !t.account_id && !t.import_batch_id) { t.account_id = accountId; t.import_batch_id = batchId; n++ }
      return n
    },
    async linkBatch(h, id, accountId) {
      const b = state.batches.find(x => x.id === id)
      if (b && !b.account_id) { b.account_id = accountId; b.formato = 'pdf'; return 1 }
      return 0
    },
    async markTransfer(h, id, expectedTipo, set) {
      const t = state.txs.find(x => x.id === id)
      if (t && t.tipo === expectedTipo) { Object.assign(t, set); return 1 }
      return 0
    },
    async restoreTransaction(h, id, values) { const t = state.txs.find(x => x.id === id); if (!t) return 0; Object.assign(t, values); return 1 },
    async restoreBatch(h, id, values) { const b = state.batches.find(x => x.id === id); if (!b) return 0; Object.assign(b, values); return 1 },
  }
  return db
}

const H = 'h1'
const tx = (id, over = {}) => ({
  id, user_id: 'u1', household_id: H, origem: 'pdf', account_id: null, import_batch_id: null, status: 'confirmada',
  created_at: '2026-09-20T12:00:20Z', data: '2026-09-10', tipo: 'despesa', valor: 10, descricao: 'COMPRA',
  transfer_kind: null, transfer_pair_id: null, transfer_direction: null, ...over,
})
const seed = {
  accounts: [
    { id: 'a-corr', instituicao: 'Banco Alfa', apelido: 'Corrente', tipo: 'corrente', owner_user_id: 'u1', final: '1234', ativo: true },
    { id: 'a-poup', instituicao: 'Banco Beta', apelido: 'Poupança', tipo: 'poupanca', owner_user_id: 'u1', final: null, ativo: true },
  ],
  batches: [{ id: 'b1', user_id: 'u1', created_at: '2026-09-20T12:00:30Z', quantidade: 2, fonte: 'Banco Alfa', account_id: null, formato: null }],
  people: [{ userId: 'u1', nome: 'Ana Exemplo Silva' }],
  txs: [
    tx('t1', { descricao: 'PIX ENVIADO ANA EXEMPLO SILVA', valor: 100 }),
    tx('t2', { descricao: 'COMPRA MERCADO', valor: 30 }),
    tx('r1', { origem: 'manual', tipo: 'receita', descricao: 'PIX RECEBIDO', valor: 100, account_id: 'a-poup', data: '2026-09-11', created_at: '2026-09-25T00:00:00Z' }),
  ],
}

describe('lotes', () => {
  it('lista lotes sem conta, contas e quantos lançamentos o vínculo acharia', async () => {
    const r = await cmdLotes({ db: fakeDb(seed), household: H })
    expect(r.lotes).toEqual([expect.objectContaining({ id: 'b1', encontrados: 2, exato: true })])
    expect(r.contas.map(c => c.id)).toEqual(['a-corr', 'a-poup'])
    expect(r.totalSemConta).toBe(2)
  })
})

describe('propor', () => {
  it('rejeita lote ou conta de outro household', async () => {
    await expect(cmdPropor({ db: fakeDb(seed), household: H, mapping: { b1: 'conta-de-outro' } })).rejects.toThrow(/não pertence/)
    await expect(cmdPropor({ db: fakeDb(seed), household: H, mapping: { 'lote-x': 'a-corr' } })).rejects.toThrow(/não pertence/)
  })
  it('propõe o par e a transferência para si mesmo usando a conta do lote', async () => {
    const r = await cmdPropor({ db: fakeDb(seed), household: H, mapping: { b1: 'a-corr' } })
    expect(r.atribuidos).toBe(2)
    expect(r.itens.map(i => [i.id, i.kind, i.aprovado])).toEqual(expect.arrayContaining([['t1', 'entre_contas', true], ['r1', 'entre_contas', true]]))
  })
})

describe('aplicar e reverter', () => {
  const mapping = { b1: 'a-corr' }
  const prepara = async db => {
    const p = await cmdPropor({ db, household: H, mapping })
    return { household: H, itens: p.itens }
  }

  it('sem --confirmar nada é gravado', async () => {
    const db = fakeDb(seed)
    const r = await cmdAplicar({ db, household: H, mapping, proposta: await prepara(db), confirmar: false })
    expect(r).toMatchObject({ gravado: false, lotes: 1, lancamentosVinculados: 2, transferencias: 2 })
    expect(db.state.txs.every(t => t.tipo !== 'transferencia')).toBe(true)
    expect(db.state.batches[0].account_id).toBeNull()
  })

  it('confirmado: vincula, marca o par e guarda o estado anterior antes de gravar', async () => {
    const db = fakeDb(seed)
    let antes = null
    let tipoNoMomentoDoBefore = null
    const r = await cmdAplicar({
      db, household: H, mapping, proposta: await prepara(db), confirmar: true,
      onBefore: async a => { antes = a; tipoNoMomentoDoBefore = db.state.txs.map(t => t.tipo) },
    })
    expect(r).toMatchObject({ gravado: true, transferenciasAplicadas: 2, falhas: [] })
    expect(tipoNoMomentoDoBefore).toEqual(['despesa', 'despesa', 'receita']) // nada tinha mudado ainda
    const t1 = db.state.txs.find(t => t.id === 't1'), r1 = db.state.txs.find(t => t.id === 'r1')
    expect(t1).toMatchObject({ tipo: 'transferencia', transfer_kind: 'entre_contas', transfer_direction: 'saida', account_id: 'a-corr', import_batch_id: 'b1' })
    expect(r1).toMatchObject({ tipo: 'transferencia', transfer_direction: 'entrada' })
    expect(t1.transfer_pair_id).toBe(r1.transfer_pair_id)
    expect(db.state.batches[0]).toMatchObject({ account_id: 'a-corr', formato: 'pdf' })
    expect(antes.transacoes.find(t => t.id === 't1')).toMatchObject({ tipo: 'despesa', account_id: null })
  })

  it('é seguro repetir: segunda execução não altera o que já mudou', async () => {
    const db = fakeDb(seed)
    const proposta = await prepara(db)
    await cmdAplicar({ db, household: H, mapping, proposta, confirmar: true })
    const r2 = await cmdAplicar({ db, household: H, mapping, proposta, confirmar: true })
    expect(r2.transferenciasAplicadas).toBe(0)
    expect(r2.falhas.length).toBeGreaterThan(0)
  })

  it('reverter devolve exatamente o estado anterior', async () => {
    const db = fakeDb(seed)
    let antes
    await cmdAplicar({ db, household: H, mapping, proposta: await prepara(db), confirmar: true, onBefore: async a => { antes = a } })
    const r = await cmdReverter({ db, household: H, antes })
    expect(r).toEqual({ transacoesRestauradas: 3, lotesRestaurados: 1 })
    expect(db.state.txs).toEqual(seed.txs)
    expect(db.state.batches).toEqual(seed.batches)
  })

  it('só aprova pares inteiros e só aceita proposta do mesmo household', async () => {
    const db = fakeDb(seed)
    const proposta = await prepara(db)
    const torta = { ...proposta, itens: proposta.itens.map(i => (i.id === 'r1' ? { ...i, aprovado: false } : i)) }
    await expect(cmdAplicar({ db, household: H, mapping, proposta: torta, confirmar: true })).rejects.toThrow(/duas pontas/)
    await expect(cmdAplicar({ db, household: 'outro', mapping: {}, proposta, confirmar: true })).rejects.toThrow(/outro household/)
    expect(db.state.txs.every(t => t.tipo !== 'transferencia')).toBe(true)
  })

  it('lote com contagem diferente é pulado e relatado, sem vincular', async () => {
    const quebrado = { ...seed, batches: [{ ...seed.batches[0], quantidade: 5 }] }
    const db = fakeDb(quebrado)
    const p = await cmdPropor({ db, household: H, mapping })
    expect(p.lotesPulados).toHaveLength(1)
    const r = await cmdAplicar({ db, household: H, mapping, proposta: { household: H, itens: [] }, confirmar: true })
    expect(r.lotes).toBe(0)
    expect(db.state.txs.find(t => t.id === 't1').account_id).toBeNull()
  })
})

describe('grupos sem lote (aplicar e reverter)', () => {
  const semLote = {
    ...seed,
    batches: [],
    txs: [
      tx('o1', { descricao: 'COMPRA A', created_at: '2026-09-29T10:00:00Z' }),
      tx('o2', { descricao: 'COMPRA B', created_at: '2026-09-29T10:00:09Z' }),
      tx('o3', { descricao: 'COMPRA C', created_at: '2026-09-30T10:00:00Z' }),
    ],
  }
  const mapping = { 'pdf|2026-09-29': 'a-corr' }

  it('lotes lista os grupos para mapeamento', async () => {
    const r = await cmdLotes({ db: fakeDb(semLote), household: H })
    expect(r.lotes).toEqual([])
    expect(r.grupos.map(g => [g.chave, g.quantidade])).toEqual([['pdf|2026-09-29', 2], ['pdf|2026-09-30', 1]])
  })

  it('vincula só a conta do grupo mapeado, sem criar lote, e reverte', async () => {
    const db = fakeDb(semLote)
    let antes
    const r = await cmdAplicar({ db, household: H, mapping, proposta: { household: H, itens: [] }, confirmar: true, onBefore: async a => { antes = a } })
    expect(r).toMatchObject({ gravado: true, lotes: 0, gruposSemLote: 1, lancamentosVinculados: 2, falhas: [] })
    expect(db.state.txs.map(t => [t.id, t.account_id, t.import_batch_id])).toEqual([
      ['o1', 'a-corr', null], ['o2', 'a-corr', null], ['o3', null, null],
    ])
    expect(antes.lotes).toEqual([])
    await cmdReverter({ db, household: H, antes })
    expect(db.state.txs).toEqual(semLote.txs)
  })

  it('rejeita conta de outro household num grupo', async () => {
    await expect(cmdPropor({ db: fakeDb(semLote), household: H, mapping: { 'pdf|2026-09-29': 'conta-alheia' } })).rejects.toThrow(/não pertence/)
  })
})

describe('criar contas', () => {
  const lista = [
    { instituicao: 'Banco Gama', apelido: 'Conta Gama', tipo: 'corrente', final: '5555', owner_user_id: 'u1' },
    { instituicao: 'Cartão Delta', apelido: 'Delta', tipo: 'cartao', final: null, owner_user_id: 'u1' },
  ]
  it('simula por padrão e só grava com confirmar', async () => {
    const db = fakeDb(seed)
    expect(await cmdContas({ db, household: H, contas: lista })).toEqual({ gravado: false, criar: 2 })
    expect(db.state.accounts).toHaveLength(2)
    const r = await cmdContas({ db, household: H, contas: lista, confirmar: true })
    expect(r.gravado).toBe(true)
    expect(db.state.accounts).toHaveLength(4)
  })
  it('aceita o dono como prefixo único do user_id e grava o id completo', async () => {
    const db = fakeDb({ ...seed, people: [{ userId: 'aaaa1111-0000', nome: 'A' }, { userId: 'bbbb2222-0000', nome: 'B' }, { userId: 'bbbb2223-0000', nome: 'C' }] })
    const ok = [{ instituicao: 'Banco Gama', apelido: 'Corrente', tipo: 'corrente', final: null, owner_user_id: 'AAAA11' }]
    const r = await cmdContas({ db, household: H, contas: ok, confirmar: true })
    expect(r.gravado).toBe(true)
    expect(db.state.accounts.at(-1).owner_user_id).toBe('aaaa1111-0000')
  })
  it('recusa prefixo ambíguo ou sem correspondência', async () => {
    const db = fakeDb({ ...seed, people: [{ userId: 'bbbb2222-0000', nome: 'B' }, { userId: 'bbbb2223-0000', nome: 'C' }] })
    const ruim = [
      { instituicao: 'Banco Gama', apelido: 'X', tipo: 'corrente', owner_user_id: 'bbbb222' },
      { instituicao: 'Banco Gama', apelido: 'Y', tipo: 'corrente', owner_user_id: 'cccc33' },
    ]
    await expect(cmdContas({ db, household: H, contas: ruim, confirmar: true })).rejects.toThrow(/mais de um[\s\S]*nenhum/)
  })
  it('valida tipo, final, dono do household e duplicidade, sem gravar nada', async () => {
    const db = fakeDb(seed)
    const ruim = [
      { instituicao: '', apelido: 'x', tipo: 'conta', final: '12', owner_user_id: 'estranho' },
      { instituicao: 'Banco Alfa', apelido: 'Corrente', tipo: 'corrente', owner_user_id: 'u1' },
    ]
    await expect(cmdContas({ db, household: H, contas: ruim, confirmar: true })).rejects.toThrow(/instituicao obrigatória[\s\S]*tipo deve ser[\s\S]*3 a 6 dígitos[\s\S]*membro do household[\s\S]*já existe/)
    expect(db.state.accounts).toHaveLength(2)
  })
})
