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
