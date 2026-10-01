import { describe, it, expect } from 'vitest'
import {
  detectTransfers, normalize,
  type DetectAccount, type DetectContext, type DetectTx,
} from './transferDetection'

// Fixture 100% sintetica: nomes, instituicoes e valores sao inventados.
const ANA = 'u-ana'
const BRUNO = 'u-bruno'

const accounts: DetectAccount[] = [
  { id: 'a-corrente-ana', instituicao: 'Banco Alfa', apelido: 'Corrente Ana', tipo: 'corrente', ownerUserId: ANA },
  { id: 'a-poup-ana', instituicao: 'Banco Beta', apelido: 'Poupança Ana', tipo: 'poupanca', ownerUserId: ANA },
  { id: 'a-corrente-bruno', instituicao: 'Banco Alfa', apelido: 'Corrente Bruno', tipo: 'corrente', ownerUserId: BRUNO },
  { id: 'a-cartao-ana', instituicao: 'Nubank', apelido: 'Cartão Ana', tipo: 'cartao', ownerUserId: ANA },
  { id: 'a-sem-dono', instituicao: 'Banco Gama', apelido: 'Sem dono', tipo: 'corrente', ownerUserId: null },
]
const people = [
  { userId: ANA, nome: 'Ana Beatriz Exemplo Silva' },
  { userId: BRUNO, nome: 'Bruno Exemplo Silva' },
]
const ctx: DetectContext = { accounts, people }

let seq = 0
const tx = (p: Partial<DetectTx> & Pick<DetectTx, 'descricao' | 'tipo' | 'valor'>): DetectTx => ({
  id: `t${++seq}`, data: '2026-09-10', accountId: 'a-corrente-ana', ...p,
})
const ids = () => { let n = 0; return () => `pair-${++n}` }
const run = (txs: DetectTx[], c: DetectContext = ctx) => detectTransfers(txs, c, { newId: ids() })

describe('normalize', () => {
  it('remove acentos, caixa e pontuação', () => {
    expect(normalize('  Transferência  recebida – JOSÉ d\'Ávila ')).toBe('TRANSFERENCIA RECEBIDA JOSE D AVILA')
  })
})

describe('extrato de conta corrente (critério de aceite)', () => {
  const salario = tx({ descricao: 'CREDITO SALARIO EMPRESA EXEMPLO LTDA', tipo: 'receita', valor: 5000 })
  const proprio = tx({ descricao: 'PIX ENVIADO ANA BEATRIZ EXEMPLO SILVA', tipo: 'despesa', valor: 300 })
  const conjuge = tx({ descricao: 'Pix enviado - BRUNO EXEMPLO SILVA', tipo: 'despesa', valor: 200 })
  const fatura = tx({ descricao: 'PIX ENVIADO NU PAGAMENTOS SA', tipo: 'despesa', valor: 1500 })
  const mercado = tx({ descricao: 'COMPRA DEBITO SUPERMERCADO EXEMPLO', tipo: 'despesa', valor: 120 })
  const out = run([salario, proprio, conjuge, fatura, mercado])
  const by = (t: DetectTx) => out.find(d => d.id === t.id)!

  it('salário e compra comum continuam sem transferência', () => {
    expect(by(salario).kind).toBeNull()
    expect(by(mercado).kind).toBeNull()
    expect(by(salario).status).toBe('nenhuma')
  })
  it('Pix para o próprio titular é entre_contas', () => {
    expect(by(proprio)).toMatchObject({ kind: 'entre_contas', status: 'auto', regra: 1 })
  })
  it('Pix para o cônjuge é household', () => {
    expect(by(conjuge)).toMatchObject({ kind: 'household', status: 'auto', regra: 1 })
  })
  it('Pix para o emissor do cartão é pagamento_fatura', () => {
    expect(by(fatura)).toMatchObject({ kind: 'pagamento_fatura', status: 'auto', regra: 2 })
  })
  it('toda decisão traz um motivo', () => {
    for (const d of out) expect(d.motivo.length).toBeGreaterThan(0)
  })
})

describe('regra 1: nomes', () => {
  const kindOf = (descricao: string, accountId = 'a-corrente-ana') =>
    run([tx({ descricao, tipo: 'despesa', valor: 10, accountId })])[0]

  it('tolera sobrenome truncado e sufixo solto', () => {
    expect(kindOf('PIX ENVIADO BRUNO EXEMPLO S').kind).toBe('household')
    expect(kindOf('PIX ENVIADO BRUNO E F').kind).toBe('household')
  })
  it('ignora acentos e caixa', () => {
    expect(kindOf('transferência pix ANA BEATRIZ EXEMPLO SILVA').kind).toBe('entre_contas')
  })
  it('só o primeiro nome é ambíguo, com sugestão', () => {
    const d = kindOf('PIX ENVIADO BRUNO')
    expect(d.status).toBe('ambigua')
    expect(d.kind).toBe('household')
  })
  it('sobrenome diferente do membro não vira auto', () => {
    expect(kindOf('PIX ENVIADO BRUNO SANTOS PEREIRA').status).toBe('ambigua')
  })
  it('sem palavra de transferência não classifica (ex.: pagamento de pessoa homônima)', () => {
    expect(kindOf('COMPRA LOJA BRUNO EXEMPLO SILVA ME').kind).toBeNull()
  })
  it('recebimento do cônjuge também é household', () => {
    const d = run([tx({ descricao: 'PIX RECEBIDO BRUNO EXEMPLO SILVA', tipo: 'receita', valor: 80 })])[0]
    expect(d.kind).toBe('household')
  })
  it('conta sem titular definido deixa de ser auto', () => {
    expect(kindOf('PIX ENVIADO BRUNO EXEMPLO SILVA', 'a-sem-dono').status).toBe('ambigua')
  })
})

describe('regra 2: cartão', () => {
  it('aceita aliases do emissor', () => {
    const d = run([tx({ descricao: 'PAGAMENTO BOLETO NUBANK', tipo: 'despesa', valor: 900 })])[0]
    expect(d.kind).toBe('pagamento_fatura')
  })
  it('não marca pagamento a instituição sem cartão cadastrado', () => {
    const d = run([tx({ descricao: 'PIX ENVIADO BANCO DELTA', tipo: 'despesa', valor: 900 })])[0]
    expect(d.kind).toBeNull()
  })
  it('"pagamento de fatura" genérico, sem cartão correspondente, é ambíguo', () => {
    const d = run([tx({ descricao: 'PAGAMENTO FATURA CARTAO ZETA', tipo: 'despesa', valor: 700 })])[0]
    expect(d).toMatchObject({ kind: 'pagamento_fatura', status: 'ambigua' })
  })
  it('pagamento recebido dentro do próprio cartão é a outra ponta da fatura', () => {
    const d = run([tx({ descricao: 'PAGAMENTO RECEBIDO', tipo: 'receita', valor: 1500, accountId: 'a-cartao-ana' })])[0]
    expect(d).toMatchObject({ kind: 'pagamento_fatura', status: 'auto' })
  })
  it('compra no cartão não é pagamento de fatura', () => {
    const d = run([tx({ descricao: 'PIX NU PAGAMENTOS COMPRA', tipo: 'despesa', valor: 50, accountId: 'a-cartao-ana' })])[0]
    expect(d.kind).toBeNull()
  })
})

describe('regra 3: pares entre contas', () => {
  it('par com o mesmo pair_id nas duas pontas e soma zero', () => {
    const s = tx({ descricao: 'TRANSF ENVIADA', tipo: 'despesa', valor: 450.55, accountId: 'a-corrente-ana' })
    const e = tx({ descricao: 'TRANSF RECEBIDA', tipo: 'receita', valor: 450.55, accountId: 'a-poup-ana', data: '2026-09-11' })
    const [ds, de] = run([s, e])
    expect(ds.pairId).toBeDefined()
    expect(ds.pairId).toBe(de.pairId)
    expect(ds).toMatchObject({ kind: 'entre_contas', status: 'auto', regra: 3, pairedWith: e.id })
    expect(de.pairedWith).toBe(s.id)
    const net = [s, e].reduce((acc, t) => acc + (t.tipo === 'receita' ? 1 : -1) * t.valor, 0)
    expect(net).toBeCloseTo(0, 2)
  })
  it('contas de titulares diferentes viram household', () => {
    const s = tx({ descricao: 'ENVIO', tipo: 'despesa', valor: 100, accountId: 'a-corrente-ana' })
    const e = tx({ descricao: 'RECEBIDO', tipo: 'receita', valor: 100, accountId: 'a-corrente-bruno' })
    expect(run([s, e])[0].kind).toBe('household')
  })
  it('entrada em conta de cartão é pagamento_fatura', () => {
    const s = tx({ descricao: 'DEBITO', tipo: 'despesa', valor: 800, accountId: 'a-corrente-ana' })
    const e = tx({ descricao: 'CREDITO', tipo: 'receita', valor: 800, accountId: 'a-cartao-ana' })
    expect(run([s, e])[0].kind).toBe('pagamento_fatura')
  })
  it('aceita até 2 dias de diferença e rejeita 3', () => {
    const base = { tipo: 'despesa' as const, valor: 60, accountId: 'a-corrente-ana' }
    const ok = run([
      tx({ ...base, descricao: 'X', data: '2026-09-10' }),
      tx({ descricao: 'Y', tipo: 'receita', valor: 60, accountId: 'a-poup-ana', data: '2026-09-12' }),
    ])
    expect(ok[0].pairId).toBeDefined()
    const longe = run([
      tx({ ...base, descricao: 'X', data: '2026-09-10' }),
      tx({ descricao: 'Y', tipo: 'receita', valor: 60, accountId: 'a-poup-ana', data: '2026-09-13' }),
    ])
    expect(longe[0].kind).toBeNull()
  })
  it('conta virada de mês: 30/09 e 01/10 contam como 1 dia', () => {
    const [d] = run([
      tx({ descricao: 'X', tipo: 'despesa', valor: 33, data: '2026-09-30' }),
      tx({ descricao: 'Y', tipo: 'receita', valor: 33, accountId: 'a-poup-ana', data: '2026-10-01' }),
    ])
    expect(d.pairId).toBeDefined()
  })
  it('valores diferentes ou mesma conta não formam par', () => {
    expect(run([
      tx({ descricao: 'X', tipo: 'despesa', valor: 10 }),
      tx({ descricao: 'Y', tipo: 'receita', valor: 10.01, accountId: 'a-poup-ana' }),
    ])[0].kind).toBeNull()
    expect(run([
      tx({ descricao: 'X', tipo: 'despesa', valor: 10 }),
      tx({ descricao: 'Y', tipo: 'receita', valor: 10 }),
    ])[0].kind).toBeNull()
  })
  it('vários candidatos de mesmo valor e mesma distância ficam ambíguos', () => {
    const s = tx({ descricao: 'X', tipo: 'despesa', valor: 75 })
    const e1 = tx({ descricao: 'Y', tipo: 'receita', valor: 75, accountId: 'a-poup-ana' })
    const e2 = tx({ descricao: 'Z', tipo: 'receita', valor: 75, accountId: 'a-corrente-bruno' })
    const [ds] = run([s, e1, e2])
    expect(ds.status).toBe('ambigua')
    expect(ds.pairId).toBeUndefined()
  })
  it('pareia com lançamento já gravado em outra conta (sem decidir por ele)', () => {
    const gravado: DetectTx = {
      id: 'saved-1', data: '2026-09-09', descricao: 'ENVIO', valor: 250, tipo: 'despesa', accountId: 'a-corrente-ana',
    }
    const novo = tx({ descricao: 'RECEBIDO', tipo: 'receita', valor: 250, accountId: 'a-poup-ana' })
    const out = run([novo], { ...ctx, existing: [gravado] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'entre_contas', pairedWith: 'saved-1' })
    expect(out[0].pairId).toBeDefined()
  })
  it('par com titulares desconhecidos mas nome do cônjuge usa a dica do nome', () => {
    const s = tx({ descricao: 'PIX ENVIADO BRUNO EXEMPLO SILVA', tipo: 'despesa', valor: 40, accountId: 'a-sem-dono' })
    const e = tx({ descricao: 'PIX RECEBIDO', tipo: 'receita', valor: 40, accountId: 'a-corrente-bruno' })
    expect(run([s, e])[0]).toMatchObject({ kind: 'household', regra: 3 })
  })
})

describe('várias contas do mesmo household não inflam receita nem despesa', () => {
  it('cada par soma zero e só o que é real fica fora das transferências', () => {
    const txs = [
      tx({ descricao: 'SALARIO', tipo: 'receita', valor: 5000 }),
      tx({ descricao: 'PIX ENVIADO ANA BEATRIZ EXEMPLO SILVA', tipo: 'despesa', valor: 1000 }),
      tx({ descricao: 'PIX RECEBIDO ANA BEATRIZ EXEMPLO SILVA', tipo: 'receita', valor: 1000, accountId: 'a-poup-ana' }),
      tx({ descricao: 'PIX ENVIADO NU PAGAMENTOS', tipo: 'despesa', valor: 2000 }),
      tx({ descricao: 'PAGAMENTO RECEBIDO', tipo: 'receita', valor: 2000, accountId: 'a-cartao-ana' }),
      tx({ descricao: 'COMPRA DEBITO PADARIA', tipo: 'despesa', valor: 25 }),
    ]
    const out = run(txs)
    const real = txs.filter((_, i) => out[i].kind === null)
    const receita = real.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0)
    const despesa = real.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0)
    expect(receita).toBe(5000)
    expect(despesa).toBe(25)
  })
})
