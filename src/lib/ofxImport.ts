// Funcoes puras de apoio ao fluxo de importacao de OFX (D8): mascaramento antes
// de enviar texto para categorizacao, deduplicacao por FITID e agrupamento.

// Ruido que bancos colocam na descricao e que atrapalha a IA e a memoria de
// categorias: data/hora embutida ("02/01 14:30") e "Data balanc.: dd/mm/aaaa".
function stripNoise(descricao: string): string {
  return descricao
    .replace(/-?\s*data\s+balanc\.?:?\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\s+\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
}

// Sequencias longas de digitos (CPF, CNPJ, conta, protocolo) nao precisam sair do
// navegador para categorizar. Mantem numeros curtos, que ajudam (ex.: "Uber 99").
export function maskForCategorization(descricao: string): string {
  return stripNoise(descricao)
    .replace(/\d[\d.\-/]{4,}\d/g, '#')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .slice(0, 200)
}

// Chave do estabelecimento para memoria de categorias: sem ruido, sem prefixo de
// operacao, sem acento, caixa alta e sem digitos soltos.
const OP_PREFIX = /^(COMPRA (COM|NO) CARTAO|COMPRA DEBITO|COMPRA CREDITO|PAGAMENTO (DE )?(BOLETO|CONTA)|COBRANCA DE|PIX (ENVIADO|RECEBIDO)?|TRANSFERENCIA (ENVIADA|RECEBIDA)( PELO PIX)?)\s*/
export function merchantKey(descricao: string): string {
  let n = maskForCategorization(descricao)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9#]+/g, ' ').trim()
  for (let i = 0; i < 3; i++) n = n.replace(OP_PREFIX, '').trim()
  return n.replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim()
}

export interface HistoryRow { descricao: string; tipo: string; categoria_id: string | null }

// Indice "estabelecimento -> categoria mais usada" a partir do historico do household.
// Exige maioria clara (>= 60%) e ignora chaves vazias ou curtas demais.
export function buildHistoryIndex(rows: HistoryRow[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!r.categoria_id || (r.tipo !== 'despesa' && r.tipo !== 'receita')) continue
    const key = `${r.tipo}|${merchantKey(r.descricao)}`
    if (key.length < 'despesa|'.length + 3) continue
    const m = counts.get(key) ?? new Map<string, number>()
    m.set(r.categoria_id, (m.get(r.categoria_id) ?? 0) + 1)
    counts.set(key, m)
  }
  const out = new Map<string, string>()
  for (const [key, m] of counts) {
    const total = [...m.values()].reduce((a, b) => a + b, 0)
    const [cat, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    if (n / total >= 0.6) out.set(key, cat)
  }
  return out
}

export function lookupHistory(index: Map<string, string>, descricao: string, tipo: string): string | null {
  return index.get(`${tipo}|${merchantKey(descricao)}`) ?? null
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export interface DedupRow { externalId: string | null }

// Marca como duplicado o que ja existe na conta (mesmo FITID) e tambem as
// repeticoes de FITID dentro do proprio arquivo: o indice unico
// (account_id, external_id) rejeitaria o lote inteiro.
export function flagDuplicates<T extends DedupRow>(
  rows: T[], existingIds: Set<string>,
): { row: T; duplicate: boolean; externalId: string | null }[] {
  const seen = new Set<string>()
  return rows.map(row => {
    const id = row.externalId
    if (!id) return { row, duplicate: false, externalId: null }
    if (existingIds.has(id)) return { row, duplicate: true, externalId: id }
    if (seen.has(id)) return { row, duplicate: false, externalId: null } // repeticao no arquivo: importa sem FITID
    seen.add(id)
    return { row, duplicate: false, externalId: id }
  })
}

// Cartao com a maioria dos lancamentos como receita sugere sinais invertidos.
export function looksInverted(kind: 'conta' | 'cartao', tipos: ('despesa' | 'receita')[]): boolean {
  if (kind !== 'cartao' || tipos.length < 5) return false
  return tipos.filter(t => t === 'receita').length / tipos.length > 0.6
}
