// Adaptador real (Supabase, chave de serviço). Toda consulta e alteração é filtrada
// por household_id: a chave de serviço ignora a RLS, então o escopo é feito aqui.
import { createClient } from '@supabase/supabase-js'

const TX_COLS = 'id,user_id,household_id,data,descricao,valor,tipo,origem,status,account_id,import_batch_id,transfer_kind,transfer_pair_id,transfer_direction,created_at'

export function createSupabaseDb({ url, serviceKey }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data }

  async function loadAll(table, cols, householdId) {
    const out = []
    for (let from = 0; ; from += 1000) {
      const page = must(await sb.from(table).select(cols).eq('household_id', householdId)
        .order('created_at').order('id').range(from, from + 999), `ler ${table}`)
      out.push(...page)
      if (page.length < 1000) return out
    }
  }

  return {
    async loadContext(householdId) {
      const members = must(await sb.from('household_members').select('user_id').eq('household_id', householdId), 'ler membros')
      if (members.length === 0) throw new Error('Household sem membros (id errado?).')
      const people = []
      for (const m of members) {
        const { data, error } = await sb.auth.admin.getUserById(m.user_id)
        if (error || !data?.user) continue
        const nome = data.user.user_metadata?.full_name || (data.user.email ?? '').split('@')[0]
        people.push({ userId: m.user_id, nome })
      }
      return {
        people,
        accounts: await loadAll('accounts', '*', householdId),
        batches: await loadAll('import_batches', '*', householdId),
        txs: await loadAll('transactions', TX_COLS, householdId),
      }
    },
    async createAccounts(householdId, contas) {
      return must(await sb.from('accounts').insert(contas.map(c => ({ ...c, household_id: householdId }))).select('id,apelido'), 'criar contas')
    },
    async linkTransactions(householdId, ids, { accountId, batchId }) {
      let n = 0
      for (let i = 0; i < ids.length; i += 200) {
        const rows = must(await sb.from('transactions').update({ account_id: accountId, import_batch_id: batchId })
          .eq('household_id', householdId).in('id', ids.slice(i, i + 200))
          .is('account_id', null).is('import_batch_id', null).select('id'), 'vincular lançamentos')
        n += rows.length
      }
      return n
    },
    async linkBatch(householdId, batchId, accountId) {
      const rows = must(await sb.from('import_batches').update({ account_id: accountId, formato: 'pdf' })
        .eq('id', batchId).eq('household_id', householdId).is('account_id', null).select('id'), 'vincular lote')
      return rows.length
    },
    async markTransfer(householdId, id, expectedTipo, set) {
      const rows = must(await sb.from('transactions').update(set)
        .eq('id', id).eq('household_id', householdId).eq('tipo', expectedTipo).select('id'), 'marcar transferência')
      return rows.length
    },
    async restoreTransaction(householdId, id, values) {
      return must(await sb.from('transactions').update(values).eq('id', id).eq('household_id', householdId).select('id'), 'restaurar lançamento').length
    },
    async restoreBatch(householdId, id, values) {
      return must(await sb.from('import_batches').update(values).eq('id', id).eq('household_id', householdId).select('id'), 'restaurar lote').length
    },
  }
}
