// D10: lógica pura da migração dos dados reais (sem rede, sem Supabase).
// Reaproveita o motor de transferências testado (src/lib/transferDetection.ts).
// Executa com Node 22+ (type stripping nativo para importar o .ts).

import { detectTransfers } from '../../src/lib/transferDetection.ts'

// Antes do D6 o app gravava os lançamentos e, imediatamente depois, o lote. Logo, os lançamentos
// de um lote são os gravados ENTRE o lote anterior (do mesmo usuário) e este. Esse corte sequencial
// funciona mesmo em importações em massa, em que vários lotes foram criados em poucos minutos.
// Para o primeiro lote de um usuário, olha no máximo LOOKBACK_MS para trás.
export const LOOKBACK_MS = 10 * 60 * 1000

// Lançamentos de importação antiga (PDF) sem conta e sem lote que pertencem a este lote.
export function matchBatchTransactions(batch, txs, batches = [batch]) {
  const t1 = new Date(batch.created_at).getTime()
  const prev = batches
    .filter(b => b.user_id === batch.user_id && new Date(b.created_at).getTime() < t1)
    .reduce((m, b) => Math.max(m, new Date(b.created_at).getTime()), -Infinity)
  const t0 = Math.max(prev, t1 - LOOKBACK_MS)
  return txs.filter(t => {
    const c = new Date(t.created_at).getTime()
    return t.origem === 'pdf' && !t.account_id && !t.import_batch_id &&
      t.user_id === batch.user_id && c > t0 && c <= t1
  })
}

// Texto para comparar fontes: sem acento, caixa alta, sem pontuação.
export const normText = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

// Fonte "simplificada": sem mês/ano e sem as palavras EXTRATO/FATURA, para agrupar lotes do mesmo lugar.
export const simplifyFonte = s => normText(String(s ?? '').replace(/\b\d{1,2}\/\d{4}\b/g, ' '))
  .replace(/\b(EXTRATO|FATURA)\b/g, ' ').replace(/\s+/g, ' ').trim()

export const FONTE_PREFIX = 'fonte~'
export const isFonteKey = k => k.startsWith(FONTE_PREFIX)

// Fontes distintas (simplificadas) com quantos lotes e lançamentos cada uma tem.
export function buildFonteReport(batches) {
  const m = new Map()
  for (const b of batches.filter(x => !x.account_id)) {
    const k = simplifyFonte(b.fonte)
    const g = m.get(k) ?? { fonte: k, lotes: 0, lancamentos: 0 }
    g.lotes++; g.lancamentos += Number(b.quantidade) || 0
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => a.fonte.localeCompare(b.fonte))
}

// Conta para um lote: o mapeamento explícito por id vence; depois, a primeira regra "fonte~..." que casar.
export function accountForBatch(batch, mapping) {
  if (mapping[batch.id]) return mapping[batch.id]
  const f = normText(batch.fonte)
  for (const [key, acct] of Object.entries(mapping)) {
    if (!acct || !isFonteKey(key)) continue
    const needle = normText(key.slice(FONTE_PREFIX.length))
    if (needle && f.includes(needle)) return acct
  }
  return null
}

// Lotes sem conta, com quantos lançamentos o vínculo por horário encontraria.
export function buildBatchReport(batches, txs) {
  return batches
    .filter(b => !b.account_id)
    .map(b => {
      const matched = matchBatchTransactions(b, txs, batches).length
      return {
        id: b.id, fonte: b.fonte, periodo_inicio: b.periodo_inicio, periodo_fim: b.periodo_fim,
        quantidade: b.quantidade, encontrados: matched, exato: matched === b.quantidade,
      }
    })
}

// Lançamentos sem conta e sem lote (importações manuais antigas): agrupados para você mapear.
// Chave: "origem|dia da gravação" (lançamentos manuais ficam todos em "manual|*").
export const GROUP_SEP = '|'
export function groupKey(t) {
  return t.origem === 'manual' ? 'manual|*' : `${t.origem}|${String(t.created_at).slice(0, 10)}`
}
export const isGroupKey = k => k.includes(GROUP_SEP)

export function buildOrphanReport(txs) {
  const groups = new Map()
  for (const t of txs.filter(x => !x.account_id && !x.import_batch_id)) {
    const k = groupKey(t)
    const g = groups.get(k) ?? { chave: k, origem: t.origem, quantidade: 0, data_min: t.data, data_max: t.data, despesas: 0, receitas: 0 }
    g.quantidade++
    g.data_min = t.data < g.data_min ? t.data : g.data_min
    g.data_max = t.data > g.data_max ? t.data : g.data_max
    if (t.tipo === 'despesa') g.despesas++
    if (t.tipo === 'receita') g.receitas++
    groups.set(k, g)
  }
  return [...groups.values()].sort((a, b) => a.chave.localeCompare(b.chave))
}

// Atribuição lançamento -> conta, só para lotes mapeados e com contagem exata.
// mapping: { [batchId]: accountId }
export function buildAssignments(batches, txs, mapping) {
  const assigned = new Map() // txId -> { accountId, batchId }
  const skipped = []
  for (const b of batches) {
    const accountId = accountForBatch(b, mapping)
    if (!accountId) continue
    const matched = matchBatchTransactions(b, txs, batches)
    if (matched.length !== b.quantidade) {
      skipped.push({ batchId: b.id, motivo: `esperado ${b.quantidade}, encontrado ${matched.length}` })
      continue
    }
    for (const t of matched) {
      if (!assigned.has(t.id)) assigned.set(t.id, { accountId, batchId: b.id })
    }
  }
  // Grupos de órfãos (sem lote): vinculam só a conta, nunca um lote.
  for (const [key, accountId] of Object.entries(mapping)) {
    if (!accountId || !isGroupKey(key)) continue
    for (const t of txs) {
      if (!t.account_id && !t.import_batch_id && groupKey(t) === key && !assigned.has(t.id)) {
        assigned.set(t.id, { accountId, batchId: null })
      }
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
  const perAccount = new Map() // lançamentos sem lote, por conta
  for (const [txId, a] of assigned) {
    if (a.batchId) perBatch.set(a.batchId, [...(perBatch.get(a.batchId) ?? []), txId])
    else perAccount.set(a.accountId, [...(perAccount.get(a.accountId) ?? []), txId])
  }
  for (const b of batches) {
    const ids = perBatch.get(b.id)
    if (ids) batchUpdates.push({ batchId: b.id, accountId: assigned.get(ids[0]).accountId, txIds: ids })
  }
  for (const [accountId, txIds] of perAccount) batchUpdates.push({ batchId: null, accountId, txIds })
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
