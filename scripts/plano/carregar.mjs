// Plano e rolling forecast: validação e montagem das linhas que o script grava no banco.
// Funções puras; o acesso ao Supabase fica em plano.mjs. O arquivo de entrada tem dados reais do cliente
// e mora em private/ (fora do Git); este módulo não contém nenhum valor real.

export const CATEGORIAS = [
  'c-moradia', 'c-alimentacao', 'c-transporte', 'c-saude', 'c-educacao', 'c-contas', 'c-restaurante',
  'c-lazer', 'c-compras', 'c-viagem', 'c-assinaturas', 'c-reserva', 'c-investimentos', 'c-previdencia', 'c-dividas',
]
export const GRUPOS = ['receita', 'necessidade', 'divida', 'desejo', 'futuro']

const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/

function addMeses(mes, n) {
  const m = Number(mes.slice(5, 7)) - 1 + n
  const ano = Number(mes.slice(0, 4)) + Math.floor(m / 12)
  return `${ano}-${String(((m % 12) + 12) % 12 + 1).padStart(2, '0')}-01`
}

const num = v => typeof v === 'number' && Number.isFinite(v)

// Devolve a lista de erros (vazia = arquivo válido).
export function validarPlano(plano, categoriasValidas = CATEGORIAS) {
  const erros = []
  const c = plano?.config
  if (!c || typeof c !== 'object') return ['config ausente']
  if (typeof c.inicio !== 'string' || !MES.test(c.inicio)) erros.push('config.inicio deve ser o primeiro dia de um mês (YYYY-MM-01)')
  if (!Number.isInteger(c.meses) || c.meses < 12 || c.meses > 36) erros.push('config.meses deve ser inteiro entre 12 e 36')
  if (!num(c.reserva_saldo) || c.reserva_saldo < 0) erros.push('config.reserva_saldo deve ser número maior ou igual a 0')
  if (!num(c.pct_reserva) || c.pct_reserva < 0 || c.pct_reserva > 1) erros.push('config.pct_reserva deve estar entre 0 e 1')
  if (!num(c.meta_reserva_meses) || c.meta_reserva_meses <= 0) erros.push('config.meta_reserva_meses deve ser maior que 0')
  if (!num(c.renda_ajuste_holerite)) erros.push('config.renda_ajuste_holerite deve ser número')
  if (c.meta_base_extra != null && (!num(c.meta_base_extra) || c.meta_base_extra < 0)) erros.push('config.meta_base_extra deve ser número maior ou igual a 0')

  if (!Array.isArray(plano.linhas) || plano.linhas.length === 0) return [...erros, 'linhas ausentes']
  const chaves = new Set()
  const usadas = { receita: new Map(), despesa: new Map() }
  for (const [i, l] of plano.linhas.entries()) {
    const nome = `linhas[${i}] (${l?.chave ?? '?'})`
    if (typeof l.chave !== 'string' || !/^[a-z0-9_]+$/.test(l.chave)) erros.push(`${nome}: chave deve ser minúscula, números e _`)
    else if (chaves.has(l.chave)) erros.push(`${nome}: chave repetida`)
    else chaves.add(l.chave)
    if (typeof l.rotulo !== 'string' || !l.rotulo.trim()) erros.push(`${nome}: rótulo ausente`)
    if (!GRUPOS.includes(l.grupo)) erros.push(`${nome}: grupo inválido`)
    if (!Array.isArray(l.categoria_ids)) erros.push(`${nome}: categoria_ids deve ser lista`)
    else for (const cat of l.categoria_ids) if (!categoriasValidas.includes(cat)) erros.push(`${nome}: categoria desconhecida ${cat}`)
    if (typeof l.rastreavel !== 'boolean') erros.push(`${nome}: rastreavel deve ser true ou false`)
    // Receita rastreável com lista vazia recebe todas as receitas do mês (as receitas não têm categoria no app).
    if (l.rastreavel && l.grupo !== 'receita' && Array.isArray(l.categoria_ids) && l.categoria_ids.length === 0) erros.push(`${nome}: linha rastreável precisa de pelo menos uma categoria`)
    if (l.sem_corte != null && (!num(l.sem_corte) || l.sem_corte < 0)) erros.push(`${nome}: sem_corte deve ser número maior ou igual a 0`)
    if (!Number.isInteger(l.ordem)) erros.push(`${nome}: ordem deve ser inteiro`)
    if (!Array.isArray(l.valores) || l.valores.length !== c.meses) erros.push(`${nome}: valores deve ter ${c.meses} números (um por mês)`)
    else if (!l.valores.every(num)) erros.push(`${nome}: valores devem ser números`)
    else if (l.grupo !== 'receita' && l.valores.some(v => v < 0)) erros.push(`${nome}: valores de despesa não podem ser negativos`)
    if (l.rastreavel && l.grupo === 'receita' && l.categoria_ids?.length > 0) erros.push(`${nome}: receita não usa categorias (deixe categoria_ids vazio)`)
    if (l.rastreavel && Array.isArray(l.categoria_ids) && GRUPOS.includes(l.grupo)) {
      const t = l.grupo === 'receita' ? 'receita' : 'despesa'
      for (const cat of l.categoria_ids) {
        if (usadas[t].has(cat) && usadas[t].get(cat) !== l.chave) erros.push(`${nome}: categoria ${cat} também está em ${usadas[t].get(cat)} (o realizado seria contado duas vezes)`)
        usadas[t].set(cat, l.chave)
      }
    }
  }
  if (!plano.linhas.some(l => l.grupo === 'receita')) erros.push('o plano precisa de ao menos uma linha de receita')
  if (plano.linhas.filter(l => l.grupo === 'receita' && l.rastreavel).length > 1) erros.push('só pode haver uma linha de receita rastreável (ela recebe todas as receitas do mês)')
  return erros
}

// Linhas e valores no formato das tabelas, já com household_id. Os ids das linhas vêm de idPorChave
// (linhas que já existem), para a carga poder ser repetida sem duplicar.
export function montarCarga(plano, householdId, idPorChave = new Map(), novoId = () => crypto.randomUUID()) {
  const { config } = plano
  const linhas = plano.linhas.map(l => ({
    id: idPorChave.get(l.chave) ?? novoId(),
    household_id: householdId,
    chave: l.chave,
    rotulo: l.rotulo,
    grupo: l.grupo,
    categoria_ids: l.categoria_ids,
    rastreavel: l.rastreavel,
    sem_corte: l.sem_corte ?? null,
    ordem: l.ordem,
  }))
  const valores = []
  plano.linhas.forEach((l, i) => {
    l.valores.forEach((v, j) => {
      valores.push({ linha_id: linhas[i].id, household_id: householdId, mes: addMeses(config.inicio, j), valor: Math.round(v * 100) / 100 })
    })
  })
  return {
    config: {
      household_id: householdId,
      inicio: config.inicio,
      meses: config.meses,
      reserva_saldo: config.reserva_saldo,
      reserva_saldo_em: config.reserva_saldo_em ?? null,
      pct_reserva: config.pct_reserva,
      meta_reserva_meses: config.meta_reserva_meses,
      renda_ajuste_holerite: config.renda_ajuste_holerite,
      meta_base_extra: config.meta_base_extra ?? 0,
      atualizado_em: new Date().toISOString(),
    },
    linhas,
    valores,
  }
}

// Resumo sem valores em reais por linha, seguro para mostrar no terminal ou colar numa conversa.
export function resumoCarga(plano) {
  const tot = { receita: 0, despesa: 0 }
  for (const l of plano.linhas) {
    const primeiros12 = l.valores.slice(0, 12).reduce((s, v) => s + v, 0)
    if (l.grupo === 'receita') tot.receita += primeiros12; else tot.despesa += primeiros12
  }
  return {
    linhas: plano.linhas.length,
    meses: plano.config.meses,
    porGrupo: Object.fromEntries(GRUPOS.map(g => [g, plano.linhas.filter(l => l.grupo === g).length])),
    naoRastreaveis: plano.linhas.filter(l => !l.rastreavel).map(l => l.chave),
    folgaMedia12m: Math.round((tot.receita - tot.despesa) / 12),
  }
}

// ─── Conteúdo das seções e pendências ───────────────────────────────────────────────────────────
// Mesmas regras do leitor do aplicativo (src/lib/planoConteudo.ts): uma seção inválida não aparece na tela,
// então o carregador recusa antes de gravar. Um teste cruzado garante que os dois lados concordam.

export const SECOES = ['diagnostico', 'metodo', 'caixa', 'corte', 'dividas']
const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = v => typeof v === 'string' && v.trim() !== ''
const partesOk = v => Array.isArray(v) && v.every(p => isObj(p) && str(p.rotulo) && num(p.valor))
const blocoOk = v => isObj(v) && num(v.total) && partesOk(v.partes)

const VALIDADORES = {
  diagnostico: d => blocoOk(d.renda) && blocoOk(d.patrimonio) && blocoOk(d.dividas) && isObj(d.parcelas)
    && num(d.parcelas.pctInicio) && num(d.parcelas.valorInicio) && num(d.parcelas.pctFim) && str(d.parcelas.rotuloInicio) && str(d.parcelas.rotuloFim),
  metodo: d => Array.isArray(d.blocos) && d.blocos.length > 0 && Array.isArray(d.ordem)
    && d.blocos.every(b => isObj(b) && str(b.pct) && str(b.titulo) && str(b.descricao))
    && d.ordem.every(o => isObj(o) && str(o.titulo) && str(o.descricao)),
  caixa: d => partesOk(d.entra) && partesOk(d.sai) && Array.isArray(d.resultados)
    && d.resultados.every(r => isObj(r) && str(r.rotulo) && num(r.valor)),
  corte: d => Array.isArray(d.linhas) && Array.isArray(d.fases)
    && num(d.totalHoje) && num(d.totalTeto) && num(d.resultadoAntes) && num(d.resultadoDepois)
    && d.linhas.every(l => isObj(l) && str(l.categoria) && str(l.como) && (l.hoje == null || num(l.hoje)) && (l.teto == null || num(l.teto)) && (l.economia == null || num(l.economia)))
    && d.fases.every(f => isObj(f) && str(f.periodo) && num(f.teto)),
  dividas: d => Array.isArray(d.itens) && d.itens.length > 0
    && d.itens.every(i => isObj(i) && str(i.rotulo) && str(i.detalhe) && str(i.dono) && typeof i.fim === 'string' && MES.test(i.fim)),
}

export function validarConteudo(arq) {
  const erros = []
  if (!isObj(arq)) return ['arquivo de conteúdo inválido']
  const secoes = arq.secoes ?? {}
  if (!isObj(secoes)) erros.push('secoes deve ser um objeto')
  else for (const [nome, dados] of Object.entries(secoes)) {
    if (!SECOES.includes(nome)) { erros.push(`seção desconhecida: ${nome}`); continue }
    if (!isObj(dados) || !VALIDADORES[nome](dados)) erros.push(`seção ${nome}: formato inválido (a tela não a mostraria)`)
  }
  const pend = arq.pendencias ?? []
  if (!Array.isArray(pend)) erros.push('pendencias deve ser uma lista')
  else {
    const titulos = new Set()
    pend.forEach((p, i) => {
      const n = `pendencias[${i}]`
      if (!isObj(p)) { erros.push(`${n}: inválida`); return }
      if (!str(p.titulo) || p.titulo.length > 200) erros.push(`${n}: titulo obrigatório (até 200 caracteres)`)
      else if (titulos.has(p.titulo)) erros.push(`${n}: título repetido`)
      else titulos.add(p.titulo)
      if (p.detalhe != null && (typeof p.detalhe !== 'string' || p.detalhe.length > 2000)) erros.push(`${n}: detalhe até 2000 caracteres`)
      if (!['casal', 'arsen'].includes(p.responsavel)) erros.push(`${n}: responsavel deve ser casal ou arsen`)
      if (!Number.isInteger(p.ordem)) erros.push(`${n}: ordem deve ser inteiro`)
    })
  }
  if (Object.keys(isObj(secoes) ? secoes : {}).length === 0 && (!Array.isArray(pend) || pend.length === 0)) erros.push('o arquivo não tem seções nem pendências')
  return erros
}

// existentes: pendências já no banco ({id, titulo}). Atualiza só título/detalhe/responsável/ordem das que já existem:
// resposta, status e datas do casal nunca são tocados pela carga.
export function montarConteudo(arq, householdId, existentes = []) {
  const porTitulo = new Map(existentes.map(e => [e.titulo, e.id]))
  const secoes = Object.entries(arq.secoes ?? {}).map(([secao, dados]) => ({ household_id: householdId, secao, dados, atualizado_em: new Date().toISOString() }))
  const inserir = [], atualizar = []
  for (const p of arq.pendencias ?? []) {
    const base = { titulo: p.titulo, detalhe: p.detalhe ?? null, responsavel: p.responsavel, ordem: p.ordem }
    if (porTitulo.has(p.titulo)) atualizar.push({ id: porTitulo.get(p.titulo), ...base })
    else inserir.push({ household_id: householdId, status: p.status ?? 'aberta', ...base })
  }
  const naoNoArquivo = existentes.filter(e => !(arq.pendencias ?? []).some(p => p.titulo === e.titulo)).map(e => e.titulo)
  return { secoes, inserir, atualizar, naoNoArquivo }
}
