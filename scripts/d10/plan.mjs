// D10: lógica pura da migração dos dados reais (sem rede, sem Supabase).
// Reaproveita o motor de transferências testado (src/lib/transferDetection.ts).
// Executa com Node 22+ (type stripping nativo para importar o .ts).

import { detectTransfers } from '../../src/lib/transferDetection.ts'

// Antes do D6 o app gravava os lançamentos e, em seguida, o lote (segundos depois).
export const WINDOW_BEFORE_MS = 10 * 60 * 1000
export const WINDOW_AFTER_MS = 60 * 1000

// Lançamentos de importação antiga (PDF) sem conta e sem lote que pertencem a este lote.
export function matchBatchTransactions(batch, txs) {
  const t0 = new Date(batch.created_at).getTime()
  return txs.filter(t =>
    t.origem === 'pdf' &&
    !t.account_id && !t.import_batch_id &&
    t.user_id === batch.user_id &&
    new Date(t.created_at).getTime() >= t0 - WINDOW_BEFORE_MS &&
    new Date(t.created_at).getTime() <= t0 + WINDOW_AFTER_MS)
}

// Lotes sem conta, com quantos lançamentos o vínculo por horário encontraria.
export function buildBatchReport(batches, txs) {
  return batches
    .filter(b => !b.account_id)
    .map(b => {
      const matched = matchBatchTransactions(b, txs).length
      return {
        id: b.id, fonte: b.fonte, periodo_inicio: b.periodo_inicio, periodo_fim: b.periodo_fim,
        quantidade: b.quantidade, encontrados: matched, exato: matched === b.quantidade,
      }
    })
}

// Atribuição lançamento -> conta, só para lotes mapeados e com contagem exata.
// mapping: { [batchId]: accountId }
export function buildAssignments(batches, txs, mapping) {
  const assigned = new Map() // txId -> { accountId, batchId }
  const skipped = []
  for (const b of batches) {
    const accountId = mapping[b.id]
    if (!accountId) continue
    const matched = matchBatchTransactions(b, txs)
    if (matched.length !== b.quantidade) {
      skipped.push({ batchId: b.id, motivo: `esperado ${b.quantidade}, encontrado ${matched.length}` })
      continue
    }
    for (const t of matched) {
      if (!assigned.has(t.id)) assigned.set(t.id, { accountId, batchId: b.id })
    }
  }
  return { assigned, skipped }
}

// Propõe transferências sobre os lançamentos que já têm conta (ou ganharão uma).
// Devolve itens para revisão humana: auto vem aprovado, ambíguo vem reprovado.
export function proposeTransfers({ txs, assigned, accounts, people }) {
  const candidates = txs
    .filter(t => (t.tipo === 'despesa' || t.tipo === 'receita') && t.status === 'confirmada')
    .map(t => ({ t, accountId: t.account_id ?? assigned.get(t.id)?.accountId ?? null }))
    .filter(x => x.accountId)

  const detections = detectTransfers(
    candidates.map(({ t, accountId }) => ({
      id: t.id, data: t.data, descricao: t.descricao, valor: Number(t.valor), tipo: t.tipo, accountId,
    })),
    {
      accounts: accounts.map(a => ({
        id: a.id, instituicao: a.instituicao, apelido: a.apelido, tipo: a.tipo, ownerUserId: a.owner_user_id,
      })),
      people,
    },
  )

  const byId = new Map(candidates.map(c => [c.t.id, c.t]))
  return detections
    .filter(d => d.kind)
    .map(d => {
      const t = byId.get(d.id)
      return {
        id: d.id, data: t.data, descricao: t.descricao, valor: Number(t.valor), tipo: t.tipo,
        kind: d.kind, regra: d.regra, motivo: d.motivo, status: d.status,
        pairId: d.pairId ?? null, pairedWith: d.pairedWith ?? null,
        aprovado: d.status === 'auto',
      }
    })
}

// Pares só valem se as duas pontas forem aprovadas juntas.
export function validateProposal(itens) {
  const erros = []
  const byPair = new Map()
  for (const i of itens) {
    if (i.pairId) byPair.set(i.pairId, [...(byPair.get(i.pairId) ?? []), i])
  }
  for (const [pairId, pts] of byPair) {
    const aprovados = pts.filter(p => p.aprovado).length
    if (aprovados !== 0 && aprovados !== pts.length) {
      erros.push(`Par ${pairId.slice(0, 8)}: aprove as duas pontas ou nenhuma (${pts.length} pontas, ${aprovados} aprovadas).`)
    }
    if (pts.length !== 2) erros.push(`Par ${pairId.slice(0, 8)}: esperado 2 pontas, achei ${pts.length}.`)
  }
  return erros
}

export const directionOf = tipo => (tipo === 'despesa' ? 'saida' : 'entrada')

// Atualizações a aplicar (sem I/O). Guardas de estado atual evitam sobrescrever o que mudou.
export function buildUpdates({ batches, assigned, itens }) {
  const batchUpdates = []
  const perBatch = new Map()
  for (const [txId, a] of assigned) {
    perBatch.set(a.batchId, [...(perBatch.get(a.batchId) ?? []), txId])
  }
  for (const b of batches) {
    const ids = perBatch.get(b.id)
    if (ids) batchUpdates.push({ batchId: b.id, accountId: assigned.get(ids[0]).accountId, txIds: ids })
  }
  const transferUpdates = itens
    .filter(i => i.aprovado)
    .map(i => ({
      id: i.id, expectedTipo: i.tipo,
      set: {
        tipo: 'transferencia', transfer_kind: i.kind, transfer_pair_id: i.pairId,
        transfer_direction: directionOf(i.tipo),
      },
    }))
  return { batchUpdates, transferUpdates }
}
