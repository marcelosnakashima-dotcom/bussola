// Cálculos das telas Home, Despesas e Receitas. Puro: sem rede nem React, testado.
// Regra de ouro: só entram lançamentos confirmados de despesa ou receita
// (transferências não são gasto nem renda; ver CLAUDE.md).

export type Classe = 'necessidade' | 'desejo' | 'poupanca'
export type Periodo = 'mes' | '3m' | '6m' | '12m'

export interface Tx {
  id: string
  data: string // YYYY-MM-DD
  descricao: string
  categoria_id: string | null
  tipo: 'despesa' | 'receita' | 'transferencia'
  valor: number | string
  status: 'pendente' | 'confirmada'
  account_id?: string | null
}

export interface CatInfo { nome: string; classificacao: Classe }

// ─── Meses ────────────────────────────────────────────────────────────
export const monthKey = (iso: string) => iso.slice(0, 7)

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function monthBounds(key: string): { from: string; to: string } {
  return { from: `${key}-01`, to: `${key}-${String(daysInMonth(key)).padStart(2, '0')}` }
}

// n meses terminando em endKey, em ordem crescente
export function lastMonths(endKey: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(endKey, i - (n - 1)))
}

export const PERIODO_MESES: Record<Periodo, number> = { mes: 1, '3m': 3, '6m': 6, '12m': 12 }
export const periodMonths = (p: Periodo, endKey: string) => lastMonths(endKey, PERIODO_MESES[p])

export function monthLabel(key: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  const nome = d.toLocaleDateString('pt-BR', { month: style, timeZone: 'UTC' }).replace('.', '')
  return style === 'long' ? `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${y}` : `${nome}/${String(y).slice(2)}`
}

// ─── Filtros base ─────────────────────────────────────────────────────
export const valorDe = (t: Tx) => Number(t.valor) || 0
export const isDespesa = (t: Tx) => t.status === 'confirmada' && t.tipo === 'despesa'
export const isReceita = (t: Tx) => t.status === 'confirmada' && t.tipo === 'receita'
const soma = (txs: Tx[]) => Math.round(txs.reduce((s, t) => s + valorDe(t), 0) * 100) / 100

export function inMonths(t: Tx, months: string[]) {
  return months.includes(monthKey(t.data))
}

// ─── Série mensal ─────────────────────────────────────────────────────
export interface MesSerie {
  mes: string
  receitas: number
  despesas: number
  saldo: number
  necessidade: number
  desejo: number
  poupanca: number
  semClasse: number
}

export function monthlySeries(txs: Tx[], months: string[], cats: Map<string, CatInfo>): MesSerie[] {
  const base = new Map(months.map(m => [m, { mes: m, receitas: 0, despesas: 0, saldo: 0, necessidade: 0, desejo: 0, poupanca: 0, semClasse: 0 }]))
  for (const t of txs) {
    const row = base.get(monthKey(t.data))
    if (!row) continue
    const v = valorDe(t)
    if (isReceita(t)) row.receitas += v
    else if (isDespesa(t)) {
      row.despesas += v
      const cl = t.categoria_id ? cats.get(t.categoria_id)?.classificacao : undefined
      if (cl) row[cl] += v
      else row.semClasse += v
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  return [...base.values()].map(r => ({
    ...r,
    receitas: r2(r.receitas), despesas: r2(r.despesas), saldo: r2(r.receitas - r.despesas),
    necessidade: r2(r.necessidade), desejo: r2(r.desejo), poupanca: r2(r.poupanca), semClasse: r2(r.semClasse),
  }))
}

// ─── Por categoria (despesas) ──────────────────────────────────────────
export interface CatTotal { id: string; nome: string; classificacao: Classe | null; valor: number; qtd: number; pct: number }
export const SEM_CATEGORIA = '__sem__'

export function byCategory(txs: Tx[], cats: Map<string, CatInfo>): CatTotal[] {
  const desp = txs.filter(isDespesa)
  const total = soma(desp)
  const map = new Map<string, CatTotal>()
  for (const t of desp) {
    const id = t.categoria_id && cats.has(t.categoria_id) ? t.categoria_id : SEM_CATEGORIA
    const info = cats.get(id)
    const row = map.get(id) ?? { id, nome: info?.nome ?? 'Sem categoria', classificacao: info?.classificacao ?? null, valor: 0, qtd: 0, pct: 0 }
    row.valor += valorDe(t)
    row.qtd++
    map.set(id, row)
  }
  return [...map.values()]
    .map(r => ({ ...r, valor: Math.round(r.valor * 100) / 100, pct: total ? r.valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor)
}

// ─── 50/30/20 do mês ────────────────────────────────────────────────────
export interface ClasseResumo { classificacao: Classe; total: number; meta: number; pct: number }
export function resumo503020(serieDoMes: MesSerie | undefined, plano: Record<Classe, number> & { renda_base?: number }) {
  const receitas = serieDoMes?.receitas ?? 0
  const renda = plano.renda_base ? Number(plano.renda_base) : receitas
  const classes: ClasseResumo[] = (['necessidade', 'desejo', 'poupanca'] as const).map(cl => {
    const total = serieDoMes?.[cl] ?? 0
    return { classificacao: cl, total, meta: renda * Number(plano[cl]), pct: renda ? total / renda : 0 }
  })
  return { renda, classes }
}

// ─── Filtro de despesas ─────────────────────────────────────────────────
export interface FiltroDespesas {
  months: string[]
  classe?: Classe | null
  categoria?: string | null
  conta?: string | null
  busca?: string | null
}

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function filterDespesas(txs: Tx[], f: FiltroDespesas, cats: Map<string, CatInfo>): Tx[] {
  const q = f.busca ? normalize(f.busca) : ''
  return txs.filter(t => {
    if (!isDespesa(t) || !inMonths(t, f.months)) return false
    if (f.conta && t.account_id !== f.conta) return false
    if (f.categoria) {
      const id = t.categoria_id && cats.has(t.categoria_id) ? t.categoria_id : SEM_CATEGORIA
      if (id !== f.categoria) return false
    }
    if (f.classe) {
      const cl = t.categoria_id ? cats.get(t.categoria_id)?.classificacao : undefined
      if (cl !== f.classe) return false
    }
    if (q && !normalize(t.descricao).includes(q)) return false
    return true
  })
}

// ─── Acumulado diário do mês (para comparar com o mês anterior) ─────────────
// Até `ateDia` (inclusive) quando o mês é o atual; depois disso, null (linha para no "hoje").
export function dailyCumulative(txs: Tx[], key: string, pred: (t: Tx) => boolean, ateDia?: number): (number | null)[] {
  const dias = daysInMonth(key)
  const porDia = new Array(dias).fill(0)
  for (const t of txs) {
    if (monthKey(t.data) !== key || !pred(t)) continue
    const d = Number(t.data.slice(8, 10))
    if (d >= 1 && d <= dias) porDia[d - 1] += valorDe(t)
  }
  let acc = 0
  return porDia.map((v, i) => {
    acc += v
    if (ateDia !== undefined && i + 1 > ateDia) return null
    return Math.round(acc * 100) / 100
  })
}

// ─── Fontes de receita (receitas não têm categoria) ──────────────────────────
// Agrupa pela descrição sem datas, horas, números longos e prefixos de operação.
export function fonteKey(descricao: string): string {
  let n = normalize(descricao)
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ')
    .replace(/\d{1,2}:\d{2}/g, ' ')
    .replace(/data balanc\.?:?/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
  n = n.replace(/^(pix|ted|doc)? ?(recebido|recebida)?\s*/, '').replace(/^(transferencia|credito|deposito)( recebida| em conta)?\s*/, '').trim()
  return n || 'outros'
}

export interface Fonte { chave: string; nome: string; valor: number; qtd: number; pct: number }
export function incomeSources(txs: Tx[], top = 6): Fonte[] {
  const rec = txs.filter(isReceita)
  const total = soma(rec)
  const map = new Map<string, Fonte>()
  for (const t of rec) {
    const chave = fonteKey(t.descricao)
    const f = map.get(chave) ?? { chave, nome: '', valor: 0, qtd: 0, pct: 0 }
    if (!f.nome) f.nome = chave.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40)
    f.valor += valorDe(t)
    f.qtd++
    map.set(chave, f)
  }
  const sorted = [...map.values()].sort((a, b) => b.valor - a.valor)
  const head = sorted.slice(0, top)
  const rest = sorted.slice(top)
  if (rest.length) {
    head.push({ chave: '__outras__', nome: 'Outras', valor: rest.reduce((s, f) => s + f.valor, 0), qtd: rest.reduce((s, f) => s + f.qtd, 0), pct: 0 })
  }
  return head.map(f => ({ ...f, valor: Math.round(f.valor * 100) / 100, pct: total ? f.valor / total : 0 }))
}

// ─── Lista agrupada por dia ────────────────────────────────────────────
export function groupByDay(txs: Tx[]): { data: string; itens: Tx[]; total: number }[] {
  const map = new Map<string, Tx[]>()
  for (const t of [...txs].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))) {
    map.set(t.data, [...(map.get(t.data) ?? []), t])
  }
  return [...map.entries()].map(([data, itens]) => ({ data, itens, total: soma(itens) }))
}

export const total = soma

// ─── Totais por dia (mapa de calor) ─────────────────────────────────────
export interface DiaTotal { dia: number; data: string; total: number; qtd: number; maior: { descricao: string; valor: number } | null }
export function dailyTotals(txs: Tx[], key: string, pred: (t: Tx) => boolean): DiaTotal[] {
  const dias = daysInMonth(key)
  const out: DiaTotal[] = Array.from({ length: dias }, (_, i) => ({
    dia: i + 1, data: `${key}-${String(i + 1).padStart(2, '0')}`, total: 0, qtd: 0, maior: null,
  }))
  for (const t of txs) {
    if (monthKey(t.data) !== key || !pred(t)) continue
    const d = out[Number(t.data.slice(8, 10)) - 1]
    if (!d) continue
    const v = valorDe(t)
    d.total += v
    d.qtd++
    if (!d.maior || v > d.maior.valor) d.maior = { descricao: t.descricao, valor: v }
  }
  return out.map(d => ({ ...d, total: Math.round(d.total * 100) / 100 }))
}

// Dia da semana (0 = domingo) do primeiro dia do mês, para montar o calendário
export function firstWeekday(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
}

// Projeção linear do total do mês a partir do acumulado até `ateDia`.
export function projecaoFimDoMes(acumuladoAteHoje: number, ateDia: number, diasNoMes: number): number {
  if (ateDia <= 0) return 0
  return Math.round((acumuladoAteHoje / ateDia) * diasNoMes * 100) / 100
}
