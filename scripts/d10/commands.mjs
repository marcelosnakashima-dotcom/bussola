// D10: orquestração dos comandos. Fala com o banco só pela interface `db`,
// o que permite testar aplicar/reverter com um banco falso em memória.
//
// db: {
//   loadContext(householdId) -> { accounts, batches, txs, people }
//   linkTransactions(householdId, ids, { accountId, batchId }) -> nº atualizado  (só se sem conta e sem lote)
//   linkBatch(householdId, batchId, accountId) -> nº atualizado                   (só se sem conta)
//   markTransfer(householdId, id, expectedTipo, set) -> nº atualizado             (só se o tipo atual bate)
//   restoreTransaction(householdId, id, values) -> nº atualizado
//   restoreBatch(householdId, id, values) -> nº atualizado
// }

import {
  buildBatchReport, buildOrphanReport, buildFonteReport, isGroupKey, isFonteKey, buildAssignments, proposeTransfers, validateProposal, buildUpdates,
} from './plan.mjs'

export async function cmdLotes({ db, household }) {
  const ctx = await db.loadContext(household)
  return {
    contas: ctx.accounts.map(a => ({ id: a.id, apelido: a.apelido, instituicao: a.instituicao, tipo: a.tipo, final: a.final, ativo: a.ativo })),
    lotes: buildBatchReport(ctx.batches, ctx.txs),
    grupos: buildOrphanReport(ctx.txs),
    fontes: buildFonteReport(ctx.batches),
    membros: ctx.people,
    totalSemConta: ctx.txs.filter(t => !t.account_id).length,
  }
}

export async function cmdPropor({ db, household, mapping }) {
  const ctx = await db.loadContext(household)
  validateMapping(mapping, ctx)
  const { assigned, skipped } = buildAssignments(ctx.batches, ctx.txs, mapping)
  const itens = proposeTransfers({ txs: ctx.txs, assigned, accounts: ctx.accounts, people: ctx.people })
  return { household, atribuidos: assigned.size, lotesPulados: skipped, itens }
}

function validateMapping(mapping, ctx) {
  const batchIds = new Set(ctx.batches.map(b => b.id))
  const accountIds = new Set(ctx.accounts.map(a => a.id))
  for (const [b, a] of Object.entries(mapping)) {
    if (!a) continue
    if (!isGroupKey(b) && !isFonteKey(b) && !batchIds.has(b)) throw new Error(`Lote ${b} não pertence a este household.`)
    if (!accountIds.has(a)) throw new Error(`Conta ${a} não pertence a este household.`)
  }
}

// confirmar=false: simulação (nada é gravado). Com confirmar, grava o "antes" via
// onBefore ANTES de qualquer alteração e depois aplica com guardas de estado.
export async function cmdAplicar({ db, household, mapping, proposta, confirmar = false, onBefore = async () => {} }) {
  if (proposta.household !== household) throw new Error('A proposta é de outro household.')
  const ctx = await db.loadContext(household)
  validateMapping(mapping, ctx)

  const erros = validateProposal(proposta.itens)
  if (erros.length) throw new Error(`Proposta inválida:\n- ${erros.join('\n- ')}`)

  const txById = new Map(ctx.txs.map(t => [t.id, t]))
  for (const i of proposta.itens.filter(x => x.aprovado)) {
    if (!txById.has(i.id)) throw new Error(`Lançamento ${i.id} não pertence a este household.`)
  }

  const { assigned, skipped } = buildAssignments(ctx.batches, ctx.txs, mapping)
  const { batchUpdates, transferUpdates } = buildUpdates({ batches: ctx.batches, assigned, itens: proposta.itens })

  const resumo = {
    lotes: batchUpdates.filter(b => b.batchId).length,
    gruposSemLote: batchUpdates.filter(b => !b.batchId).length,
    lancamentosVinculados: batchUpdates.reduce((s, b) => s + b.txIds.length, 0),
    transferencias: transferUpdates.length,
    lotesPulados: skipped,
    gravado: false,
  }
  if (!confirmar) return resumo

  // Guarda o estado anterior de tudo o que será tocado, antes de gravar.
  const touchedTx = new Set([...batchUpdates.flatMap(b => b.txIds), ...transferUpdates.map(t => t.id)])
  const antes = {
    household,
    transacoes: [...touchedTx].map(id => {
      const t = txById.get(id)
      return {
        id, account_id: t.account_id ?? null, import_batch_id: t.import_batch_id ?? null, tipo: t.tipo,
        transfer_kind: t.transfer_kind ?? null, transfer_pair_id: t.transfer_pair_id ?? null,
        transfer_direction: t.transfer_direction ?? null,
      }
    }),
    lotes: batchUpdates.filter(b => b.batchId).map(b => {
      const lote = ctx.batches.find(x => x.id === b.batchId)
      return { id: b.batchId, account_id: lote.account_id ?? null, formato: lote.formato ?? null }
    }),
  }
  await onBefore(antes)

  const falhas = []
  for (const b of batchUpdates) {
    const n = await db.linkTransactions(household, b.txIds, { accountId: b.accountId, batchId: b.batchId })
    if (n !== b.txIds.length) falhas.push(`${b.batchId ? `Lote ${b.batchId}` : 'Grupo sem lote'}: ${n} de ${b.txIds.length} lançamentos vinculados (o restante já mudou).`)
    if (b.batchId) await db.linkBatch(household, b.batchId, b.accountId)
  }
  let aplicadas = 0
  for (const t of transferUpdates) {
    const n = await db.markTransfer(household, t.id, t.expectedTipo, t.set)
    if (n === 1) aplicadas++
    else falhas.push(`Lançamento ${t.id}: não alterado (tipo atual diferente do esperado).`)
  }
  return { ...resumo, gravado: true, transferenciasAplicadas: aplicadas, falhas }
}

// Cria contas do household a partir de uma lista. Simulação por padrão.
const TIPOS = ['corrente', 'poupanca', 'investimento', 'cartao', 'outro']
export async function cmdContas({ db, household, contas, confirmar = false }) {
  const ctx = await db.loadContext(household)
  const donos = new Set(ctx.people.map(p => p.userId))
  const erros = []
  contas.forEach((c, i) => {
    const n = `Conta ${i + 1}`
    if (!c.instituicao || !String(c.instituicao).trim()) erros.push(`${n}: instituicao obrigatória.`)
    if (!c.apelido || !String(c.apelido).trim()) erros.push(`${n}: apelido obrigatório.`)
    if (!TIPOS.includes(c.tipo)) erros.push(`${n}: tipo deve ser ${TIPOS.join(', ')}.`)
    if (c.final != null && !/^[0-9]{3,6}$/.test(String(c.final))) erros.push(`${n}: final deve ter de 3 a 6 dígitos.`)
    if (!c.owner_user_id || !donos.has(c.owner_user_id)) erros.push(`${n}: owner_user_id deve ser um membro do household.`)
  })
  const existentes = new Set(ctx.accounts.map(a => `${String(a.instituicao).toUpperCase()}|${String(a.apelido).toUpperCase()}`))
  contas.forEach((c, i) => {
    if (existentes.has(`${String(c.instituicao).toUpperCase()}|${String(c.apelido).toUpperCase()}`)) erros.push(`Conta ${i + 1}: já existe uma conta com esta instituição e apelido.`)
  })
  if (erros.length) throw new Error(`Lista de contas inválida:\n- ${erros.join('\n- ')}`)
  if (!confirmar) return { gravado: false, criar: contas.length }
  const criadas = await db.createAccounts(household, contas.map(c => ({
    instituicao: String(c.instituicao).trim(), apelido: String(c.apelido).trim(), tipo: c.tipo,
    final: c.final == null ? null : String(c.final), owner_user_id: c.owner_user_id,
  })))
  return { gravado: true, criadas: criadas.map(a => ({ id: a.id, apelido: a.apelido })) }
}

export async function cmdReverter({ db, household, antes }) {
  if (antes.household !== household) throw new Error('O arquivo "antes" é de outro household.')
  let tx = 0, lotes = 0
  for (const t of antes.transacoes) {
    const { id, ...values } = t
    tx += await db.restoreTransaction(household, id, values)
  }
  for (const l of antes.lotes) {
    const { id, ...values } = l
    lotes += await db.restoreBatch(household, id, values)
  }
  return { transacoesRestauradas: tx, lotesRestaurados: lotes }
}
