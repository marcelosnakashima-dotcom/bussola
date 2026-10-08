// Conteúdo do plano que o casal vê na tela (as seções da apresentação). Os dados vêm de plano_conteudo (jsonb)
// e podem estar incompletos ou malformados: cada leitor devolve null quando a seção não é utilizável, e a tela
// simplesmente não mostra aquela seção.

export interface Parte { rotulo: string; valor: number }
export interface Diagnostico {
  subtitulo?: string
  renda: { total: number; partes: Parte[]; nota?: string }
  patrimonio: { total: number; partes: Parte[]; nota?: string }
  dividas: { total: number; partes: Parte[]; nota?: string }
  parcelas: { pctInicio: number; rotuloInicio: string; valorInicio: number; pctFim: number; rotuloFim: string; nota?: string }
  rodape?: string
}
export interface Metodo {
  subtitulo?: string
  blocos: { pct: string; titulo: string; descricao: string }[]
  ordem: { titulo: string; descricao: string }[]
}
export interface Caixa {
  subtitulo?: string
  entra: Parte[]
  sai: Parte[]
  rendaTipica?: number
  resultados: { rotulo: string; valor: number; tipo?: 'dinheiro' | 'neutro' }[]
  nota?: string
}
export interface LinhaCorte {
  categoria: string
  hoje: number | null
  hojeNota?: string
  teto: number | null
  tetoTexto?: string
  economia: number
  como: string
}
export interface Corte {
  subtitulo?: string
  linhas: LinhaCorte[]
  totalHoje: number
  totalTeto: number
  resultadoAntes: number
  resultadoDepois: number
  fases: { periodo: string; teto: number }[]
  nota?: string
}
export interface ItemDivida { rotulo: string; detalhe: string; fim: string; dono: string; estimado: boolean }
export interface Dividas { subtitulo?: string; itens: ItemDivida[]; nota?: string }

export interface Pendencia {
  id: string
  ordem: number
  titulo: string
  detalhe: string | null
  responsavel: 'casal' | 'arsen'
  status: 'aberta' | 'em_analise' | 'resolvida'
  resposta: string | null
  respondidoEm: string | null
}

export interface ConteudoPlano {
  diagnostico: Diagnostico | null
  metodo: Metodo | null
  caixa: Caixa | null
  corte: Corte | null
  dividas: Dividas | null
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const opt = (v: unknown): string | undefined => str(v) ?? undefined

function partes(v: unknown): Parte[] | null {
  if (!Array.isArray(v)) return null
  const out: Parte[] = []
  for (const p of v) {
    if (!isObj(p)) return null
    const rotulo = str(p.rotulo), valor = num(p.valor)
    if (rotulo === null || valor === null) return null
    out.push({ rotulo, valor })
  }
  return out
}

function bloco(v: unknown): { total: number; partes: Parte[]; nota?: string } | null {
  if (!isObj(v)) return null
  const total = num(v.total), p = partes(v.partes)
  if (total === null || p === null) return null
  return { total, partes: p, nota: opt(v.nota) }
}

export function lerDiagnostico(d: unknown): Diagnostico | null {
  if (!isObj(d)) return null
  const renda = bloco(d.renda), patrimonio = bloco(d.patrimonio), dividas = bloco(d.dividas)
  const p = isObj(d.parcelas) ? d.parcelas : null
  if (!renda || !patrimonio || !dividas || !p) return null
  const pctInicio = num(p.pctInicio), valorInicio = num(p.valorInicio), pctFim = num(p.pctFim)
  const rotuloInicio = str(p.rotuloInicio), rotuloFim = str(p.rotuloFim)
  if (pctInicio === null || valorInicio === null || pctFim === null || rotuloInicio === null || rotuloFim === null) return null
  return {
    subtitulo: opt(d.subtitulo), renda, patrimonio, dividas,
    parcelas: { pctInicio, rotuloInicio, valorInicio, pctFim, rotuloFim, nota: opt(p.nota) },
    rodape: opt(d.rodape),
  }
}

export function lerMetodo(d: unknown): Metodo | null {
  if (!isObj(d) || !Array.isArray(d.blocos) || !Array.isArray(d.ordem)) return null
  const blocos: Metodo['blocos'] = []
  for (const b of d.blocos) {
    if (!isObj(b)) return null
    const pct = str(b.pct), titulo = str(b.titulo), descricao = str(b.descricao)
    if (!pct || !titulo || !descricao) return null
    blocos.push({ pct, titulo, descricao })
  }
  const ordem: Metodo['ordem'] = []
  for (const o of d.ordem) {
    if (!isObj(o)) return null
    const titulo = str(o.titulo), descricao = str(o.descricao)
    if (!titulo || !descricao) return null
    ordem.push({ titulo, descricao })
  }
  return blocos.length ? { subtitulo: opt(d.subtitulo), blocos, ordem } : null
}

export function lerCaixa(d: unknown): Caixa | null {
  if (!isObj(d)) return null
  const entra = partes(d.entra), sai = partes(d.sai)
  if (!entra || !sai || !Array.isArray(d.resultados)) return null
  const resultados: Caixa['resultados'] = []
  for (const r of d.resultados) {
    if (!isObj(r)) return null
    const rotulo = str(r.rotulo), valor = num(r.valor)
    if (!rotulo || valor === null) return null
    resultados.push({ rotulo, valor, tipo: r.tipo === 'neutro' ? 'neutro' : 'dinheiro' })
  }
  return { subtitulo: opt(d.subtitulo), entra, sai, rendaTipica: num(d.rendaTipica) ?? undefined, resultados, nota: opt(d.nota) }
}

export function lerCorte(d: unknown): Corte | null {
  if (!isObj(d) || !Array.isArray(d.linhas) || !Array.isArray(d.fases)) return null
  const totalHoje = num(d.totalHoje), totalTeto = num(d.totalTeto), antes = num(d.resultadoAntes), depois = num(d.resultadoDepois)
  if (totalHoje === null || totalTeto === null || antes === null || depois === null) return null
  const linhas: LinhaCorte[] = []
  for (const l of d.linhas) {
    if (!isObj(l)) return null
    const categoria = str(l.categoria), como = str(l.como), economia = num(l.economia) ?? 0
    if (!categoria || !como) return null
    linhas.push({ categoria, hoje: num(l.hoje), hojeNota: opt(l.hojeNota), teto: num(l.teto), tetoTexto: opt(l.tetoTexto), economia, como })
  }
  const fases: Corte['fases'] = []
  for (const f of d.fases) {
    if (!isObj(f)) return null
    const periodo = str(f.periodo), teto = num(f.teto)
    if (!periodo || teto === null) return null
    fases.push({ periodo, teto })
  }
  return { subtitulo: opt(d.subtitulo), linhas, totalHoje, totalTeto, resultadoAntes: antes, resultadoDepois: depois, fases, nota: opt(d.nota) }
}

export function lerDividas(d: unknown): Dividas | null {
  if (!isObj(d) || !Array.isArray(d.itens)) return null
  const itens: ItemDivida[] = []
  for (const i of d.itens) {
    if (!isObj(i)) return null
    const rotulo = str(i.rotulo), detalhe = str(i.detalhe), fim = str(i.fim), dono = str(i.dono)
    if (!rotulo || !detalhe || !fim || !dono || !/^\d{4}-\d{2}-01$/.test(fim)) return null
    itens.push({ rotulo, detalhe, fim, dono, estimado: i.estimado === true })
  }
  return itens.length ? { subtitulo: opt(d.subtitulo), itens, nota: opt(d.nota) } : null
}

export function lerConteudo(linhas: { secao: string; dados: unknown }[]): ConteudoPlano {
  const por = new Map(linhas.map(l => [l.secao, l.dados]))
  return {
    diagnostico: lerDiagnostico(por.get('diagnostico')),
    metodo: lerMetodo(por.get('metodo')),
    caixa: lerCaixa(por.get('caixa')),
    corte: lerCorte(por.get('corte')),
    dividas: lerDividas(por.get('dividas')),
  }
}

export function lerPendencias(rows: unknown[]): Pendencia[] {
  const out: Pendencia[] = []
  for (const r of rows) {
    if (!isObj(r)) continue
    const id = str(r.id), titulo = str(r.titulo)
    if (!id || !titulo) continue
    out.push({
      id, titulo,
      ordem: num(r.ordem) ?? 0,
      detalhe: str(r.detalhe),
      responsavel: r.responsavel === 'arsen' ? 'arsen' : 'casal',
      status: r.status === 'resolvida' ? 'resolvida' : r.status === 'em_analise' ? 'em_analise' : 'aberta',
      resposta: str(r.resposta),
      respondidoEm: str(r.respondido_em),
    })
  }
  return out.sort((a, b) => a.ordem - b.ordem)
}
