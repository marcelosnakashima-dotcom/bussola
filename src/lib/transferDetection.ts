// Motor de deteccao de transferencias (D5). Modulo puro: sem rede, sem Supabase,
// sem estado. Recebe lancamentos, contas e pessoas do household e devolve uma
// decisao por lancamento, sempre com o motivo, para a tela de revisao exibir e
// o usuario poder reverter. Nada aqui grava no banco.
//
// Regras (ordem de precedencia: 3 > 2 > 1):
//  3. Par entre contas: saida numa conta e entrada de mesmo valor em outra, ate 2 dias.
//  2. Emissor de cartao: Pix/boleto/TED para instituicao em que o household tem cartao
//     (e o "pagamento recebido" na propria conta do cartao) = pagamento_fatura.
//  1. Titular/household: contraparte com nome de um membro do household.
//  4. Ambiguos ficam com status 'ambigua' e a sugestao marcada; nunca sao auto.

export type TransferKind = 'entre_contas' | 'pagamento_fatura' | 'household'
export type DetectAccountTipo = 'corrente' | 'poupanca' | 'investimento' | 'cartao' | 'outro'

export interface DetectAccount {
  id: string
  instituicao: string
  apelido: string
  tipo: DetectAccountTipo
  ownerUserId: string | null
}

export interface DetectPerson {
  userId: string
  nome: string
}

export interface DetectTx {
  id: string
  data: string // YYYY-MM-DD
  descricao: string
  valor: number // sempre positivo
  tipo: 'despesa' | 'receita'
  accountId: string
}

export interface DetectContext {
  accounts: DetectAccount[]
  people: DetectPerson[]
  // Lancamentos ja gravados (nao transferencias) usados so como possiveis pares.
  existing?: DetectTx[]
}

export interface Detection {
  id: string
  kind: TransferKind | null
  status: 'auto' | 'ambigua' | 'nenhuma'
  regra: 1 | 2 | 3 | null
  motivo: string
  pairId?: string
  // id do outro lado do par (novo ou ja gravado)
  pairedWith?: string
}

export const PAIR_MAX_DAYS = 2

// ─── Normalizacao ──────────────────────────────────────────────
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

const tokens = (s: string) => normalize(s).split(' ').filter(Boolean)
const hasPhrase = (haystack: string, phrase: string) => ` ${haystack} `.includes(` ${phrase} `)
const cents = (v: number) => Math.round(v * 100)

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

const TRANSFER_KW = /\b(PIX|TED|DOC|TRANSF[A-Z]*)\b/
const BILLING_KW = /\b(PIX|TED|BOLETO|PAGAMENTO|PAG|PGTO|FATURA|TRANSF[A-Z]*)\b/

// ─── Regra 1: nome de pessoa do household ─────────────────────
// Casa o primeiro nome e depois tokens da descricao que sejam prefixo dos
// proximos nomes da pessoa, em ordem (extratos truncam o sobrenome e deixam
// sufixos soltos, como "S" ou "F"). Devolve quantos tokens do nome casaram.
function nameMatchCount(descTokens: string[], personName: string): number {
  const p = tokens(personName)
  if (p.length === 0) return 0
  let best = 0
  descTokens.forEach((t, i) => {
    if (t !== p[0]) return
    let matched = 1
    let next = 1
    for (const d of descTokens.slice(i + 1)) {
      for (let k = next; k < p.length; k++) {
        if (p[k].startsWith(d)) { matched++; next = k + 1; break }
      }
    }
    best = Math.max(best, matched)
  })
  return best
}

function kindForPerson(
  person: DetectPerson, account: DetectAccount | undefined,
): { kind: TransferKind; certain: boolean } {
  const owner = account?.ownerUserId ?? null
  if (owner === null) return { kind: 'household', certain: false }
  return { kind: owner === person.userId ? 'entre_contas' : 'household', certain: true }
}

function detectByName(
  tx: DetectTx, account: DetectAccount | undefined, people: DetectPerson[],
): Detection | null {
  const norm = normalize(tx.descricao)
  if (!TRANSFER_KW.test(norm)) return null
  const dt = tokens(tx.descricao)
  const scored = people
    .map(p => ({ p, n: nameMatchCount(dt, p.nome) }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
  if (scored.length === 0) return null

  const top = scored[0]
  const tied = scored.filter(x => x.n === top.n)
  const full = top.n >= 2
  if (full && tied.length === 1) {
    const { kind, certain } = kindForPerson(top.p, account)
    return {
      id: tx.id, kind, regra: 1, status: certain ? 'auto' : 'ambigua',
      motivo: certain
        ? kind === 'entre_contas'
          ? 'Contraparte é o próprio titular da conta.'
          : 'Contraparte é outro membro do household.'
        : 'Contraparte é membro do household, mas a conta não tem titular definido.',
    }
  }
  // Apenas o primeiro nome, ou mais de uma pessoa casando: sugere, nao decide.
  const only = tied.length === 1 ? kindForPerson(top.p, account).kind : 'household'
  return {
    id: tx.id, kind: only, regra: 1, status: 'ambigua',
    motivo: 'Nome parecido com o de um membro do household, mas incompleto. Confirme.',
  }
}

// ─── Regra 2: emissor de cartao ─────────────────────────────
const ISSUER_ALIASES: { when: RegExp; patterns: string[] }[] = [
  { when: /\bNU(BANK)?\b/, patterns: ['NU PAGAMENTOS', 'NUBANK', 'NU PAG'] },
  { when: /\bXP\b/, patterns: ['XP', 'XP INVESTIMENTOS'] },
  { when: /\b(BB|BANCO DO BRASIL|OUROCARD)\b/, patterns: ['BB CARTOES', 'BB', 'BANCO DO BRASIL', 'OUROCARD'] },
  { when: /\bSANTANDER\b/, patterns: ['SANTANDER'] },
  { when: /\bMERCADO ?PAGO\b/, patterns: ['MERCADO PAGO', 'MERCADOPAGO'] },
  { when: /\bITAU\b/, patterns: ['ITAU', 'ITAUCARD'] },
  { when: /\bBRADESCO\b/, patterns: ['BRADESCO', 'BRADESCARD'] },
  { when: /\bINTER\b/, patterns: ['BANCO INTER', 'INTER'] },
  { when: /\bC6\b/, patterns: ['C6', 'C6 BANK'] },
]

function issuerPatterns(instituicao: string): string[] {
  const n = normalize(instituicao)
  const out = new Set<string>(n ? [n] : [])
  for (const a of ISSUER_ALIASES) if (a.when.test(n)) a.patterns.forEach(p => out.add(p))
  return [...out]
}

function detectCardPayment(
  tx: DetectTx, account: DetectAccount | undefined, accounts: DetectAccount[],
): Detection | null {
  const norm = normalize(tx.descricao)

  // Credito "pagamento recebido" dentro do proprio cartao: ponta da fatura.
  if (account?.tipo === 'cartao') {
    if (tx.tipo === 'receita' && /\b(PAGAMENTO|PGTO|PAG)\b/.test(norm)) {
      return {
        id: tx.id, kind: 'pagamento_fatura', regra: 2, status: 'auto',
        motivo: 'Pagamento recebido na fatura do cartão (mesmo dinheiro pago pela conta corrente).',
      }
    }
    return null
  }
  if (tx.tipo !== 'despesa') return null

  if (BILLING_KW.test(norm)) {
    for (const card of accounts.filter(a => a.tipo === 'cartao')) {
      if (issuerPatterns(card.instituicao).some(p => hasPhrase(norm, p))) {
        return {
          id: tx.id, kind: 'pagamento_fatura', regra: 2, status: 'auto',
          motivo: `Pagamento para ${card.instituicao}, emissor de um cartão do household.`,
        }
      }
    }
  }
  if (/\bFATURA\b/.test(norm) && /\b(PAGAMENTO|PGTO|PAG)\b/.test(norm)) {
    return {
      id: tx.id, kind: 'pagamento_fatura', regra: 2, status: 'ambigua',
      motivo: 'Parece pagamento de fatura, mas o emissor não corresponde a um cartão cadastrado.',
    }
  }
  return null
}

// ─── Regra 3: pares entre contas ──────────────────────────────
function kindForPair(
  out: DetectTx, inn: DetectTx, byId: Map<string, DetectAccount>, hint: TransferKind | null,
): { kind: TransferKind; certain: boolean } {
  const a = byId.get(out.accountId)
  const b = byId.get(inn.accountId)
  if (b?.tipo === 'cartao') return { kind: 'pagamento_fatura', certain: true }
  if (a?.ownerUserId && b?.ownerUserId) {
    return { kind: a.ownerUserId === b.ownerUserId ? 'entre_contas' : 'household', certain: true }
  }
  if (hint) return { kind: hint, certain: true }
  return { kind: 'entre_contas', certain: false }
}

interface Edge { out: DetectTx; inn: DetectTx; diff: number }

function findEdges(all: DetectTx[], newIds: Set<string>): Edge[] {
  const outs = all.filter(t => t.tipo === 'despesa')
  const ins = all.filter(t => t.tipo === 'receita')
  const edges: Edge[] = []
  for (const out of outs) {
    for (const inn of ins) {
      if (out.accountId === inn.accountId) continue
      if (!newIds.has(out.id) && !newIds.has(inn.id)) continue
      if (cents(out.valor) !== cents(inn.valor)) continue
      const diff = Math.abs(dayNumber(out.data) - dayNumber(inn.data))
      if (diff <= PAIR_MAX_DAYS) edges.push({ out, inn, diff })
    }
  }
  return edges
}

// ─── API ────────────────────────────────────────────────
export function detectTransfers(
  txs: DetectTx[],
  ctx: DetectContext,
  opts: { newId?: () => string } = {},
): Detection[] {
  const newId = opts.newId ?? (() => crypto.randomUUID())
  const byId = new Map(ctx.accounts.map(a => [a.id, a]))
  const newIds = new Set(txs.map(t => t.id))
  const result = new Map<string, Detection>()

  // Dicas por nome (regra 1) tambem ajudam a classificar pares sem titular.
  const nameHints = new Map<string, Detection>()
  for (const t of txs) {
    const d = detectByName(t, byId.get(t.accountId), ctx.people)
    if (d) nameHints.set(t.id, d)
  }

  // Regra 3: pares mutuamente unicos; o resto vira ambiguo.
  const all = [...txs, ...(ctx.existing ?? []).filter(e => !newIds.has(e.id))]
  let edges = findEdges(all, newIds)
  for (;;) {
    const best = (id: string, side: 'out' | 'inn') => {
      const mine = edges.filter(e => e[side].id === id)
      const min = Math.min(...mine.map(e => e.diff))
      return mine.filter(e => e.diff === min)
    }
    const pick = edges.find(e => {
      const o = best(e.out.id, 'out')
      const i = best(e.inn.id, 'inn')
      return o.length === 1 && i.length === 1 && o[0] === e && i[0] === e
    })
    if (!pick) break
    const { out, inn } = pick
    const hint = nameHints.get(out.id)?.kind ?? nameHints.get(inn.id)?.kind ?? null
    const { kind, certain } = kindForPair(out, inn, byId, hint)
    const pairId = newId()
    const motivo = `Saída e entrada de mesmo valor em contas diferentes (${pick.diff === 0 ? 'mesmo dia' : `${pick.diff} dia(s) de diferença`}).`
    for (const [self, other] of [[out, inn], [inn, out]] as const) {
      if (!newIds.has(self.id)) continue
      result.set(self.id, {
        id: self.id, kind, regra: 3, status: certain ? 'auto' : 'ambigua',
        motivo: certain ? motivo : `${motivo} Titulares das contas não definidos: confirme o tipo.`,
        pairId, pairedWith: other.id,
      })
    }
    edges = edges.filter(e => e.out.id !== out.id && e.inn.id !== inn.id)
  }
  for (const e of edges) {
    for (const [self, other] of [[e.out, e.inn], [e.inn, e.out]] as const) {
      if (!newIds.has(self.id) || result.has(self.id)) continue
      const count = edges.filter(x => x.out.id === self.id || x.inn.id === self.id).length
      const { kind } = kindForPair(e.out, e.inn, byId, nameHints.get(self.id)?.kind ?? null)
      result.set(self.id, {
        id: self.id, kind, regra: 3, status: 'ambigua',
        motivo: `Há ${count} possível(is) par(es) com mesmo valor em outras contas. Confirme qual é o correto.`,
        pairedWith: other.id,
      })
    }
  }

  // Regras 2 e 1 para o que sobrou.
  for (const t of txs) {
    if (result.has(t.id)) continue
    const account = byId.get(t.accountId)
    const found = detectCardPayment(t, account, ctx.accounts) ?? nameHints.get(t.id)
    result.set(t.id, found ?? {
      id: t.id, kind: null, status: 'nenhuma', regra: null, motivo: 'Lançamento comum.',
    })
  }

  return txs.map(t => result.get(t.id)!)
}
