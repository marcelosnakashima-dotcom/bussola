// Funcoes puras de apoio ao fluxo de importacao de OFX (D8): mascaramento antes
// de enviar texto para categorizacao, deduplicacao por FITID e agrupamento.

// Sequencias longas de digitos (CPF, CNPJ, conta, protocolo) nao precisam sair do
// navegador para categorizar. Mantem numeros curtos, que ajudam (ex.: "Uber 99").
export function maskForCategorization(descricao: string): string {
  return descricao
    .replace(/\d[\d.\-/]{4,}\d/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
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
