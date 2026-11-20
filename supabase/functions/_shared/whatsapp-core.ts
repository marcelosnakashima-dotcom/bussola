// Núcleo puro do lançamento de gastos por WhatsApp. Sem rede, sem Deno, sem banco:
// recebe texto/payloads e devolve decisões. É aqui que ficam as regras de segurança
// (webhook autenticado, telefone normalizado, rascunho validado), todas testadas.

// ─── Categorias (espelha a tabela categories; mesma lista das outras funções) ───
export const CATEGORIES: { id: string; nome: string; palavras: string[] }[] = [
  { id: 'c-alimentacao', nome: 'Alimentação', palavras: ['mercado', 'supermercado', 'padaria', 'acougue', 'hortifruti', 'feira', 'atacadao', 'assai'] },
  { id: 'c-restaurante', nome: 'Restaurantes e bares', palavras: ['restaurante', 'lanche', 'lanchonete', 'bar', 'cafe', 'ifood', 'rappi', 'pizza', 'hamburguer', 'almoco', 'jantar', 'delivery'] },
  { id: 'c-transporte', nome: 'Transporte', palavras: ['uber', '99', 'taxi', 'gasolina', 'combustivel', 'posto', 'estacionamento', 'pedagio', 'onibus', 'metro', 'ipva'] },
  { id: 'c-saude', nome: 'Saúde', palavras: ['farmacia', 'remedio', 'medico', 'consulta', 'exame', 'dentista', 'plano de saude', 'academia'] },
  { id: 'c-moradia', nome: 'Moradia', palavras: ['aluguel', 'condominio', 'iptu', 'luz', 'energia', 'agua', 'gas', 'internet', 'reforma'] },
  { id: 'c-educacao', nome: 'Educação', palavras: ['escola', 'faculdade', 'curso', 'livro', 'mensalidade'] },
  { id: 'c-lazer', nome: 'Lazer e entretenimento', palavras: ['cinema', 'show', 'teatro', 'parque', 'jogo'] },
  { id: 'c-compras', nome: 'Compras e vestuário', palavras: ['roupa', 'sapato', 'tenis', 'amazon', 'mercado livre', 'shopee', 'loja'] },
  { id: 'c-viagem', nome: 'Viagens', palavras: ['passagem', 'hotel', 'airbnb', 'hospedagem'] },
  { id: 'c-assinaturas', nome: 'Assinaturas', palavras: ['netflix', 'spotify', 'disney', 'prime', 'youtube', 'assinatura'] },
  { id: 'c-contas', nome: 'Contas de consumo', palavras: ['telefone', 'celular', 'tim', 'vivo', 'claro'] },
  { id: 'c-tarifas', nome: 'Tarifas e juros bancários', palavras: ['tarifa', 'iof', 'juros', 'anuidade'] },
  { id: 'c-investimentos', nome: 'Investimentos', palavras: ['investimento', 'aporte', 'tesouro', 'acoes'] },
  { id: 'c-reserva', nome: 'Reserva de emergência', palavras: ['reserva'] },
  { id: 'c-previdencia', nome: 'Previdência', palavras: ['previdencia', 'pgbl', 'vgbl'] },
]
export const CATEGORY_IDS = new Set(CATEGORIES.map(c => c.id))
export const categoryName = (id: string | null) => CATEGORIES.find(c => c.id === id)?.nome ?? null

// ─── Texto ──────────────────────────────────────────────────────────────
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const hasWord = (norm: string, word: string) => new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(norm)

// ─── Telefone ───────────────────────────────────────────────────────────
// Forma canônica: 55 + DDD + 9 dígitos (celular com o nono dígito). Só celulares BR.
export function normalizeBrPhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  if (!d.startsWith('55')) return null
  if (d.length === 12 && /^[6-9]/.test(d.slice(4))) d = d.slice(0, 4) + '9' + d.slice(4) // celular sem o nono dígito
  if (d.length !== 13) return null
  return /^55[1-9][1-9]9\d{8}$/.test(d) ? d : null
}

// Variantes para casar com o que o WhatsApp devolve (com e sem o nono dígito).
export function phoneVariants(canonical: string): string[] {
  return [canonical, canonical.slice(0, 4) + canonical.slice(5)]
}

// ─── Comparação segura (segredo do webhook) ────────────────────────────────
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ─── Data ───────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/
// today = YYYY-MM-DD (fuso de São Paulo, calculado por quem chama)
export function parseDateBR(text: string, today: string): { date: string; matched: string } | { invalid: true; matched: string } | null {
  const n = normalize(text)
  if (hasWord(n, 'anteontem')) return { date: addDays(today, -2), matched: 'anteontem' }
  if (hasWord(n, 'ontem')) return { date: addDays(today, -1), matched: 'ontem' }
  if (hasWord(n, 'hoje')) return { date: today, matched: 'hoje' }
  const m = DATE_RE.exec(text)
  if (m) {
    const [ty] = today.split('-').map(Number)
    let y = m[3] ? Number(m[3]) : ty
    if (m[3] && m[3].length === 2) y += 2000
    let date = validDate(y, Number(m[2]), Number(m[1]))
    // sem ano informado e no futuro além de 7 dias: era do ano anterior
    if (date && !m[3] && date > addDays(today, 7)) date = validDate(y - 1, Number(m[2]), Number(m[1]))
    return date ? { date, matched: m[0] } : { invalid: true, matched: m[0] }
  }
  const dia = /\bdia (\d{1,2})\b/.exec(n)
  if (dia) {
    const [ty, tm] = today.split('-').map(Number)
    let date = validDate(ty, tm, Number(dia[1]))
    if (date && date > addDays(today, 7)) {
      const pm = tm === 1 ? 12 : tm - 1
      date = validDate(tm === 1 ? ty - 1 : ty, pm, Number(dia[1]))
    }
    return date ? { date, matched: dia[0] } : { invalid: true, matched: dia[0] }
  }
  return null
}

// ─── Valor ──────────────────────────────────────────────────────────────
interface AmountCandidate { valor: number; score: number; matched: string }
const AMOUNT_RE = /(R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(mil|k)\b)?(\s*(?:reais|real|conto|contos|pila|pilas)\b)?/gi

export function parseAmountBR(text: string): { valor: number; matched: string } | { ambiguous: true } | null {
  const cands: AmountCandidate[] = []
  let m: RegExpExecArray | null
  AMOUNT_RE.lastIndex = 0
  while ((m = AMOUNT_RE.exec(text))) {
    const raw = m[2]
    const temMilhar = /\.\d{3}/.test(raw) && /^\d{1,3}(\.\d{3})+/.test(raw)
    let n = temMilhar ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw.replace(',', '.'))
    if (!Number.isFinite(n)) continue
    if (m[3]) n *= 1000
    const decimal = /[.,]\d{1,2}$/.test(raw) && !temMilhar || /,\d{1,2}$/.test(raw)
    const score = (m[1] || m[4] ? 2 : 0) + (decimal ? 1 : 0)
    cands.push({ valor: Math.round(n * 100) / 100, score, matched: m[0] })
  }
  if (cands.length === 0) return null
  const top = Math.max(...cands.map(c => c.score))
  const best = cands.filter(c => c.score === top)
  const distintos = new Set(best.map(c => c.valor))
  if (distintos.size > 1) return { ambiguous: true }
  return { valor: best[0].valor, matched: best[0].matched }
}

// ─── Interpretação do texto de um gasto/receita ────────────────────────────
const RECEITA = ['recebi', 'recebido', 'recebimento', 'salario', 'entrou', 'ganhei', 'vendi', 'venda', 'deposito', 'depositaram']
const NAO_SUPORTADO = ['transferi', 'transferencia', 'transferir', 'fatura', 'emprestimo', 'financiamento']
const RUIDO = new Set(['gastei', 'paguei', 'pago', 'comprei', 'compra', 'recebi', 'de', 'do', 'da', 'no', 'na', 'em', 'com', 'um', 'uma', 'reais', 'real', 'hoje', 'ontem', 'anteontem', 'dia', 'foi', 'r$', 'pra', 'para', 'por'])

export interface Draft {
  tipo: 'despesa' | 'receita'
  valor: number
  descricao: string
  data: string
  categoria_id: string | null
}
export type ParseResult =
  | { ok: true; draft: Draft; avisos: string[] }
  | { ok: false; motivo: 'vazio' | 'sem_valor' | 'valor_ambiguo' | 'nao_suportado' }

export function suggestCategory(descricao: string): string | null {
  const n = normalize(descricao)
  for (const c of CATEGORIES) {
    if (c.palavras.some(p => (p.includes(' ') ? n.includes(p) : hasWord(n, p)))) return c.id
  }
  return null
}

export function parseExpenseText(text: string, today: string): ParseResult {
  const t = String(text ?? '').trim()
  if (!t) return { ok: false, motivo: 'vazio' }
  const n = normalize(t)
  if (NAO_SUPORTADO.some(w => hasWord(n, w))) return { ok: false, motivo: 'nao_suportado' }

  const avisos: string[] = []
  const dt = parseDateBR(t, today)
  let data = today
  let semData = t
  if (dt) {
    if ('invalid' in dt) avisos.push(`Não entendi a data "${dt.matched}"; usei hoje.`)
    else data = dt.date
    semData = t.replace(dt.matched, ' ')
  }
  const amount = parseAmountBR(semData)
  if (!amount) return { ok: false, motivo: 'sem_valor' }
  if ('ambiguous' in amount) return { ok: false, motivo: 'valor_ambiguo' }

  const tipo: Draft['tipo'] = RECEITA.some(w => hasWord(n, w)) ? 'receita' : 'despesa'
  const resto = semData.replace(amount.matched, ' ')
  const palavras = resto.split(/\s+/).filter(Boolean).filter(w => !RUIDO.has(normalize(w)))
  let descricao = palavras.join(' ').replace(/[^\p{L}\p{N}\s.,&'-]/gu, '').trim().slice(0, 80)
  const categoria_id = tipo === 'despesa' ? suggestCategory(descricao || t) : null
  if (!descricao) descricao = tipo === 'receita' ? 'Receita via WhatsApp' : (categoryName(categoria_id) ?? 'Gasto via WhatsApp')
  descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1)
  return { ok: true, draft: { tipo, valor: amount.valor, descricao, data, categoria_id }, avisos }
}

// ─── Validação do rascunho (vale para texto, áudio e foto) ──────────────────────
export const MAX_VALOR = 1_000_000
export function validateDraft(d: Draft, today: string): string[] {
  const erros: string[] = []
  if (!(d.valor > 0) || d.valor > MAX_VALOR) erros.push('valor fora do intervalo permitido')
  if (d.tipo !== 'despesa' && d.tipo !== 'receita') erros.push('tipo inválido')
  if (!d.descricao || d.descricao.length > 120) erros.push('descrição inválida')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || d.data > addDays(today, 1) || d.data < addDays(today, -400)) erros.push('data fora do intervalo permitido')
  if (d.categoria_id !== null && !CATEGORY_IDS.has(d.categoria_id)) erros.push('categoria desconhecida')
  if (d.tipo === 'receita' && d.categoria_id !== null) erros.push('receita não leva categoria')
  return erros
}

// ─── Respostas do usuário ────────────────────────────────────────────────────
export type Reply = 'sim' | 'nao' | 'desfazer' | 'ajuda' | null
export function classifyReply(text: string): Reply {
  const raw = String(text ?? '').trim()
  if (/^(👍|✅)$/.test(raw)) return 'sim'
  if (/^(👎|❌)$/.test(raw)) return 'nao'
  const n = normalize(raw).replace(/[.!?]+$/g, '')
  if (['sim', 's', 'ok', 'confirmo', 'confirmar', 'confirma', 'isso', 'certo', 'pode', 'pode gravar', 'correto'].includes(n)) return 'sim'
  if (['nao', 'n', 'cancelar', 'cancela', 'errado', 'nao quero', 'cancelado'].includes(n)) return 'nao'
  if (['desfazer', 'desfaz', 'apagar ultimo', 'desfazer ultimo'].includes(n)) return 'desfazer'
  if (['ajuda', 'menu', 'oi', 'ola', 'help', '?'].includes(n)) return 'ajuda'
  return null
}

// "codigo 123456" / "vincular 123456" / só "123456"
export function parseLinkCode(text: string): string | null {
  const m = /^\s*(?:c[oó]digo|codigo|vincular|code)?\s*[:#-]?\s*(\d{6})\s*$/i.exec(String(text ?? ''))
  return m ? m[1] : null
}

// ─── Mensagens enviadas ─────────────────────────────────────────────────────
export const formatBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string) => iso.split('-').reverse().join('/')

export function formatConfirmation(d: Draft): string {
  const cat = d.tipo === 'despesa' ? `\nCategoria: ${categoryName(d.categoria_id) ?? 'sem categoria'}` : ''
  return `${d.tipo === 'despesa' ? 'Gasto' : 'Receita'}: *${d.descricao}*\nValor: ${formatBRL(d.valor)}\nData: ${fmtData(d.data)}${cat}\n\nConfirma? Responda *sim* ou *não*.`
}
export const formatSaved = (d: Draft) => `Registrado: ${d.descricao}, ${formatBRL(d.valor)}. Para apagar, responda *desfazer*.`
export const MSG_AJUDA = 'Envie um gasto em uma frase, por exemplo: _mercado 85,90_ ou _recebi 3000 salário_. Também aceito áudio e foto de cupom. Eu mostro o que entendi e você confirma antes de eu gravar.'
export const MSG_CANCELADO = 'Tudo bem, não registrei nada.'
export const MSG_NAO_ENTENDI = 'Não consegui entender o valor. Tente assim: _mercado 85,90_.'
export const MSG_AMBIGUO = 'Encontrei mais de um valor na mensagem. Mande de novo com um só valor, por exemplo: _uber 15,50_.'
export const MSG_NAO_SUPORTADO = 'Por aqui eu registro só gastos e receitas. Transferências e faturas de cartão você importa pelo app, na tela Importar.'
export const MSG_SEM_PENDENCIA = 'Não há nada aguardando confirmação. Envie um gasto, por exemplo: _mercado 85,90_.'
export const MSG_EXPIROU = 'Esse lançamento expirou sem confirmação, então não registrei. Envie de novo se quiser.'
export const MSG_NAO_VINCULADO = 'Este número ainda não está vinculado a uma conta Arsen. No app, abra Perfil → WhatsApp e siga as instruções.'
export const MSG_VINCULADO = 'Pronto, seu WhatsApp está vinculado. Envie um gasto, por exemplo: _mercado 85,90_.'
export const MSG_CODIGO_INVALIDO = 'Código inválido ou expirado. Gere um novo no app, em Perfil → WhatsApp.'
export const MSG_LIMITE = 'Você enviou muitas mensagens em pouco tempo. Tente de novo em alguns minutos.'
export const MSG_ERRO = 'Tive um problema para processar essa mensagem. Tente de novo em instantes.'

// ─── Limite de uso ─────────────────────────────────────────────────────────
export function isRateLimited(timestampsMs: number[], nowMs: number, max = 30, windowMs = 60 * 60 * 1000): boolean {
  return timestampsMs.filter(t => nowMs - t < windowMs).length >= max
}

// ─── Payload da Z-API (ReceivedCallback) ─────────────────────────────────────
// Formato conforme a documentação da Z-API. CONFIRMAR com um payload real do seu
// número (registrando só as chaves, nunca o conteúdo) antes de ligar em produção.
export type Inbound =
  | { skip: string }
  | {
      skip?: undefined
      messageId: string
      phone: string // como veio, só dígitos
      instanceId: string | null
      kind: 'text' | 'audio' | 'image'
      text: string | null
      mediaUrl: string | null
      mimeType: string | null
      audioSeconds: number | null
    }

export function parseZapiPayload(body: unknown): Inbound {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, any>
  if (b.type !== 'ReceivedCallback') return { skip: 'tipo_nao_suportado' }
  if (b.fromMe === true || b.fromApi === true) return { skip: 'mensagem_propria' }
  if (b.isGroup === true || b.isNewsletter === true || b.broadcast === true) return { skip: 'grupo_ou_lista' }
  if (b.isStatusReply === true || b.isEdit === true || b.waitingMessage === true) return { skip: 'evento_ignorado' }
  const messageId = typeof b.messageId === 'string' ? b.messageId : ''
  const phone = typeof b.phone === 'string' ? b.phone.replace(/\D/g, '') : ''
  if (!messageId || !phone) return { skip: 'sem_id_ou_telefone' }
  const base = { messageId, phone, instanceId: typeof b.instanceId === 'string' ? b.instanceId : null }
  if (b.text && typeof b.text.message === 'string') {
    return { ...base, kind: 'text', text: b.text.message, mediaUrl: null, mimeType: null, audioSeconds: null }
  }
  if (b.image && typeof b.image.imageUrl === 'string') {
    return { ...base, kind: 'image', text: typeof b.image.caption === 'string' ? b.image.caption : null, mediaUrl: b.image.imageUrl, mimeType: b.image.mimeType ?? null, audioSeconds: null }
  }
  if (b.audio && typeof b.audio.audioUrl === 'string') {
    return { ...base, kind: 'audio', text: null, mediaUrl: b.audio.audioUrl, mimeType: b.audio.mimeType ?? null, audioSeconds: Number.isFinite(b.audio.seconds) ? b.audio.seconds : null }
  }
  return { skip: 'sem_conteudo_suportado' }
}

// ─── Mídia: só HTTPS e hosts permitidos (evita SSRF), com limites de tamanho ─────────
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024
export const MAX_AUDIO_SECONDS = 60
export function isAllowedMediaUrl(url: string, allowedHosts: string[]): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.username || u.password) return false
    const host = u.hostname.toLowerCase()
    if (/^(localhost|.*\.local|.*\.internal)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':')) return false
    return allowedHosts.some(h => host === h.toLowerCase() || host.endsWith('.' + h.toLowerCase()))
  } catch {
    return false
  }
}
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const AUDIO_TYPES = new Set(['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/aac'])
