// Rolling forecast do plano financeiro. Funções puras: recebem o plano (premissas, linhas e valores
// mensais), o realizado agregado das transações e os meses fechados, e devolvem a janela de 12 meses.
// Nada aqui fala com o banco; os hooks em usePlano.ts fazem isso.
//
// Meses são chaves 'YYYY-MM-01'.

export type Grupo = 'receita' | 'necessidade' | 'divida' | 'desejo' | 'futuro'
export type Cenario = 'plano' | 'sem_corte' | 'ritmo' | 'ritmo_10'
export type BaseRenda = 'tipica' | 'holerite' | 'realizada'

export const CENARIOS: { id: Cenario; label: string; desc: string }[] = [
  { id: 'plano',     label: 'Plano',            desc: 'Segue o plano combinado, com os tetos de desejos' },
  { id: 'sem_corte', label: 'Sem o corte',      desc: 'Desejos no patamar anterior ao corte' },
  { id: 'ritmo',     label: 'Ritmo atual',      desc: 'Necessidades e desejos na média dos últimos 3 meses fechados' },
  { id: 'ritmo_10',  label: 'Ritmo atual +10%', desc: 'Ritmo atual com 10% a mais em necessidades e desejos' },
]

export const BASES_RENDA: { id: BaseRenda; label: string }[] = [
  { id: 'tipica',    label: 'Renda típica' },
  { id: 'holerite',  label: 'Holerite mais recente' },
  { id: 'realizada', label: 'Ritmo realizado' },
]

export interface PlanoLinha {
  id: string
  chave: string
  rotulo: string
  grupo: Grupo
  categoriaIds: string[]
  rastreavel: boolean
  semCorte: number | null
  ordem: number
}

export interface PlanoConfig {
  inicio: string
  meses: number
  reservaSaldo: number
  pctReserva: number
  metaReservaMeses: number
  rendaAjusteHolerite: number
  // necessidades descontadas em folha: fora do caixa, mas entram na base da meta da reserva
  metaBaseExtra: number
}

// Uma linha do retorno de plano_realizado()
export interface RealizadoRow {
  mes: string
  categoria_id: string | null
  tipo: 'despesa' | 'receita'
  total: number
}

// valores[linhaId][mes] = valor planejado
export type PlanoValores = Record<string, Record<string, number>>

export interface PlanoEntrada {
  config: PlanoConfig
  linhas: PlanoLinha[]
  valores: PlanoValores
  realizado: RealizadoRow[]
  fechados: string[]
}

export interface MesProjetado {
  mes: string
  receita: number
  necessidade: number
  divida: number
  desejo: number
  futuro: number
  despesas: number
  folga: number
  aporte: number
  reservaFim: number
  metaReserva: number
  porLinha: Record<string, number>
}

export interface Projecao {
  mesCorrente: string
  planoCompleto: boolean
  janela: MesProjetado[]
}

export interface ResumoCenario {
  cenario: Cenario
  folgaMedia: number
  folgaPrimeiroMes: number
  reservaFinal: number
  metaFinal: number
  mesesAteMeta: number | null
  mesDaMeta: string | null
}

const JANELA = 12
const MESES_RITMO = 3

// ─── Meses ───────────────────────────────────────────────────────────────

export function addMeses(mes: string, n: number): string {
  const y = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7)) - 1 + n
  const ano = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${String(ano).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}-01`
}

export function inicioDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function rotuloMes(mes: string, curto = true): string {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1)
  const s = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
  return curto ? s : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function ultimoMesDoPlano(config: PlanoConfig): string {
  return addMeses(config.inicio, config.meses - 1)
}

// O mês corrente é o primeiro mês, a partir do início, que ainda não foi fechado. A sequência importa:
// um mês fechado depois de um aberto não avança nada.
export function mesCorrente(config: PlanoConfig, fechados: string[]): { mes: string; completo: boolean } {
  const set = new Set(fechados)
  const ultimo = ultimoMesDoPlano(config)
  let m = config.inicio
  while (set.has(m)) {
    if (m === ultimo) return { mes: ultimo, completo: true }
    m = addMeses(m, 1)
  }
  return { mes: m, completo: false }
}

export function mesesFechadosEmSequencia(config: PlanoConfig, fechados: string[]): string[] {
  const set = new Set(fechados)
  const out: string[] = []
  let m = config.inicio
  const ultimo = ultimoMesDoPlano(config)
  while (set.has(m) && m <= ultimo) { out.push(m); m = addMeses(m, 1) }
  return out
}

// ─── Realizado ───────────────────────────────────────────────────────────

// Receitas não têm categoria no app: a linha de receita rastreável recebe todas as receitas do mês.
export function realizadoDaLinha(linha: PlanoLinha, mes: string, rows: RealizadoRow[]): number {
  const tipo = linha.grupo === 'receita' ? 'receita' : 'despesa'
  const cats = new Set(linha.categoriaIds)
  let s = 0
  for (const r of rows) {
    if (r.mes !== mes || r.tipo !== tipo) continue
    if (tipo === 'receita' || (r.categoria_id != null && cats.has(r.categoria_id))) s += Number(r.total)
  }
  return s
}

// Despesas confirmadas do mês que nenhuma linha do plano cobre (sem categoria ou categoria fora do mapa).
export function realizadoSemLinha(linhas: PlanoLinha[], mes: string, rows: RealizadoRow[]): { despesa: number; receita: number } {
  const cobertas = new Set<string>()
  for (const l of linhas) {
    if (l.grupo === 'receita') continue
    for (const c of l.categoriaIds) cobertas.add(c)
  }
  const receitaCoberta = linhas.some(l => l.grupo === 'receita' && l.rastreavel)
  const out = { despesa: 0, receita: 0 }
  for (const r of rows) {
    if (r.mes !== mes) continue
    if (r.tipo === 'receita') { if (!receitaCoberta) out.receita += Number(r.total) }
    else if (r.categoria_id == null || !cobertas.has(r.categoria_id)) out.despesa += Number(r.total)
  }
  return out
}

export function valorPlanejado(valores: PlanoValores, linhaId: string, mes: string): number {
  return valores[linhaId]?.[mes] ?? 0
}

// Média dos últimos meses fechados (até 3). Linhas não rastreáveis, ou sem mês fechado, não têm ritmo.
function ritmoDaLinha(linha: PlanoLinha, e: PlanoEntrada): number | null {
  if (!linha.rastreavel) return null
  const seq = mesesFechadosEmSequencia(e.config, e.fechados)
  const ultimos = seq.slice(-MESES_RITMO)
  if (ultimos.length === 0) return null
  const soma = ultimos.reduce((s, m) => s + realizadoDaLinha(linha, m, e.realizado), 0)
  return soma / ultimos.length
}

// ─── Projeção ────────────────────────────────────────────────────────────

export function projetar(e: PlanoEntrada, cenario: Cenario, base: BaseRenda): Projecao {
  const { mes: corrente, completo } = mesCorrente(e.config, e.fechados)
  const ultimo = ultimoMesDoPlano(e.config)
  const restantes = mesesEntre(corrente, ultimo) + 1
  const tamanho = Math.max(0, Math.min(JANELA, restantes))

  const ritmo = new Map<string, number | null>()
  for (const l of e.linhas) ritmo.set(l.id, ritmoDaLinha(l, e))

  const fator = cenario === 'ritmo_10' ? 1.1 : 1
  const janela: MesProjetado[] = []
  let reserva = e.config.reservaSaldo

  for (let i = 0; i < tamanho; i++) {
    const mes = addMeses(corrente, i)
    const porLinha: Record<string, number> = {}
    const tot: Record<Grupo, number> = { receita: 0, necessidade: 0, divida: 0, desejo: 0, futuro: 0 }

    for (const l of e.linhas) {
      const plano = valorPlanejado(e.valores, l.id, mes)
      let v = plano
      if (l.grupo === 'receita') {
        if (base === 'realizada') v = ritmo.get(l.id) ?? plano
        // o ajuste do holerite é uma diferença mensal sobre a renda típica, aplicada à primeira linha de receita
      } else if (l.grupo === 'desejo') {
        if (cenario === 'sem_corte') v = l.semCorte ?? plano
        else if (cenario === 'ritmo' || cenario === 'ritmo_10') v = (ritmo.get(l.id) ?? plano) * fator
      } else if (l.grupo === 'necessidade') {
        if (cenario === 'ritmo' || cenario === 'ritmo_10') v = (ritmo.get(l.id) ?? plano) * fator
      }
      porLinha[l.chave] = v
      tot[l.grupo] += v
    }

    if (base === 'holerite') tot.receita += e.config.rendaAjusteHolerite

    const despesas = tot.necessidade + tot.divida + tot.desejo + tot.futuro
    const folga = tot.receita - despesas
    const aporte = Math.max(folga, 0) * e.config.pctReserva
    reserva += aporte
    janela.push({
      mes,
      receita: tot.receita,
      necessidade: tot.necessidade,
      divida: tot.divida,
      desejo: tot.desejo,
      futuro: tot.futuro,
      despesas,
      folga,
      aporte,
      reservaFim: reserva,
      metaReserva: e.config.metaReservaMeses * (tot.necessidade + tot.divida + e.config.metaBaseExtra),
      porLinha,
    })
  }

  return { mesCorrente: corrente, planoCompleto: completo, janela }
}

function mesesEntre(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))
}

export function compararCenarios(e: PlanoEntrada, base: BaseRenda): ResumoCenario[] {
  return CENARIOS.map(({ id }) => {
    const { janela } = projetar(e, id, base)
    if (janela.length === 0) {
      return { cenario: id, folgaMedia: 0, folgaPrimeiroMes: 0, reservaFinal: e.config.reservaSaldo, metaFinal: 0, mesesAteMeta: null, mesDaMeta: null }
    }
    const idx = janela.findIndex(m => m.reservaFim >= m.metaReserva)
    return {
      cenario: id,
      folgaMedia: janela.reduce((s, m) => s + m.folga, 0) / janela.length,
      folgaPrimeiroMes: janela[0].folga,
      reservaFinal: janela[janela.length - 1].reservaFim,
      metaFinal: janela[janela.length - 1].metaReserva,
      mesesAteMeta: idx >= 0 ? idx + 1 : null,
      mesDaMeta: idx >= 0 ? janela[idx].mes : null,
    }
  })
}

// ─── Mês corrente: desejos contra o teto ─────────────────────────────────

export interface DesejoDoMes {
  chave: string
  rotulo: string
  teto: number
  realizado: number
  pct: number
  projetado: number
}

// hoje: usado para extrapolar o ritmo do mês corrente. Se o mês corrente não é o mês de hoje
// (por exemplo, extrato de setembro ainda sendo importado em outubro), não há projeção linear.
export function desejosDoMes(e: PlanoEntrada, mes: string, hoje: Date): DesejoDoMes[] {
  const ano = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7)) - 1
  const diasNoMes = new Date(ano, m + 1, 0).getDate()
  const ehHoje = hoje.getFullYear() === ano && hoje.getMonth() === m
  const dia = ehHoje ? Math.max(1, hoje.getDate()) : diasNoMes

  return e.linhas
    .filter(l => l.grupo === 'desejo' && l.rastreavel)
    .sort((a, b) => a.ordem - b.ordem)
    .map(l => {
      const teto = valorPlanejado(e.valores, l.id, mes)
      const realizado = realizadoDaLinha(l, mes, e.realizado)
      return {
        chave: l.chave,
        rotulo: l.rotulo,
        teto,
        realizado,
        pct: teto > 0 ? realizado / teto : realizado > 0 ? Infinity : 0,
        projetado: ehHoje ? (realizado / dia) * diasNoMes : realizado,
      }
    })
}

// ─── Meses fechados: realizado contra o plano ────────────────────────────

export interface MesFechado {
  mes: string
  receitaPlano: number
  receitaReal: number
  despesaPlano: number
  despesaReal: number
  folgaPlano: number
  folgaReal: number
}

// Para linhas não rastreáveis (ex.: consignado em folha) o realizado assume o planejado.
export function historicoFechado(e: PlanoEntrada): MesFechado[] {
  return mesesFechadosEmSequencia(e.config, e.fechados).map(mes => {
    let rp = 0, rr = 0, dp = 0, dr = 0
    for (const l of e.linhas) {
      const plano = valorPlanejado(e.valores, l.id, mes)
      const real = l.rastreavel ? realizadoDaLinha(l, mes, e.realizado) : plano
      if (l.grupo === 'receita') { rp += plano; rr += real } else { dp += plano; dr += real }
    }
    const sem = realizadoSemLinha(e.linhas, mes, e.realizado)
    dr += sem.despesa
    return { mes, receitaPlano: rp, receitaReal: rr, despesaPlano: dp, despesaReal: dr, folgaPlano: rp - dp, folgaReal: rr - dr }
  })
}

// Linhas de despesa disputando a mesma categoria dobram o realizado. O carregador usa esta checagem.
export function categoriasDuplicadas(linhas: PlanoLinha[]): string[] {
  const vistas = new Map<string, string>()
  const dup = new Set<string>()
  for (const l of linhas) {
    if (!l.rastreavel) continue
    const t = l.grupo === 'receita' ? 'r' : 'd'
    for (const c of l.categoriaIds) {
      const k = `${t}:${c}`
      if (vistas.has(k) && vistas.get(k) !== l.chave) dup.add(c)
      vistas.set(k, l.chave)
    }
  }
  return [...dup]
}
