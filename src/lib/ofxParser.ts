// Leitor de OFX no navegador (D7). Modulo puro: recebe bytes ou texto e devolve
// extratos estruturados. Cobre OFX 1.x (SGML, folhas sem tag de fechamento) e
// 2.x (XML), acentos em UTF-8 ou windows-1252/latin-1, extrato de conta
// (STMTRS) e de cartao (CCSTMTRS). Nao grava nada e nao conhece o Supabase.

export type OfxStatementKind = 'conta' | 'cartao'

export interface OfxTransaction {
  fitid: string | null
  tipoOfx: string | null // TRNTYPE
  data: string // YYYY-MM-DD, os digitos de DTPOSTED sem conversao de fuso
  valor: number // com sinal, como veio no arquivo (apos invertSign, se usado)
  descricao: string // NAME e MEMO combinados
  name: string | null
  memo: string | null
}

export interface OfxStatement {
  kind: OfxStatementKind
  moeda: string | null
  bankId: string | null
  acctId: string | null
  acctType: string | null
  inicio: string | null
  fim: string | null
  transacoes: OfxTransaction[]
}

export interface OfxResult {
  statements: OfxStatement[]
  warnings: string[]
}

export interface ParseOptions {
  // Alguns emissores de cartao enviam compras com valor positivo. Se o arquivo
  // vier assim, a tela deve oferecer a inversao (confirmar com extratos reais).
  invertSign?: boolean
}

// ─── Decodificacao de bytes ──────────────────────────────────
// Le o cabecalho como ASCII para achar o charset; sem declaracao, tenta UTF-8
// estrito e cai para windows-1252 (o padrao dos bancos brasileiros).
export function decodeOfx(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const head = new TextDecoder('latin1').decode(u8.subarray(0, 1024)).toUpperCase()
  const declaredUtf8 = /ENCODING\s*[:=]\s*"?UTF-?8/.test(head) || /CHARSET\s*[:=]\s*"?UTF-?8/.test(head)
  const declaredLatin = /CHARSET\s*[:=]\s*"?(1252|ISO-8859-1|LATIN)/.test(head) || /ENCODING\s*=\s*"?(WINDOWS-1252|ISO-8859-1)/.test(head)

  if (declaredUtf8 && !declaredLatin) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8) } catch { /* cai para 1252 */ }
  }
  if (!declaredLatin) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8) } catch { /* nao e UTF-8 */ }
  }
  return new TextDecoder('windows-1252').decode(u8)
}

// ─── Tokenizacao ─────────────────────────────────────────────
// Agregados conhecidos; qualquer outra tag e folha. Isso evita confundir uma
// folha vazia do SGML (ex.: <MEMO> sem valor) com a abertura de um agregado.
const AGGREGATES = new Set([
  'OFX', 'SIGNONMSGSRSV1', 'SONRS', 'STATUS', 'BANKMSGSRSV1', 'STMTTRNRS', 'STMTRS',
  'BANKACCTFROM', 'BANKTRANLIST', 'STMTTRN', 'LEDGERBAL', 'AVAILBAL',
  'CREDITCARDMSGSRSV1', 'CCSTMTTRNRS', 'CCSTMTRS', 'CCACCTFROM', 'BANKACCTTO', 'CCACCTTO',
])

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&')
}

export function parseOfxDate(raw: string): string | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})/.exec(raw)
  if (!m) return null
  const [, y, mo, d] = m
  const month = Number(mo), day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${mo}-${d}`
}

// Aceita "1234.56", "-1.234,56", "1,234.56", "+10" e "-0,50".
export function parseOfxAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, '').replace(/^\+/, '')
  if (!/^-?[\d.,]+$/.test(s)) return null
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ','
    const thousands = dec === '.' ? ',' : '.'
    s = s.split(thousands).join('').replace(dec, '.')
  } else if (lastComma >= 0) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function combineDescription(name: string | null, memo: string | null): string {
  const parts = [name, memo].map(p => (p ?? '').trim()).filter(Boolean)
  if (parts.length === 2) {
    const [a, b] = parts
    if (a.toUpperCase() === b.toUpperCase() || a.toUpperCase().includes(b.toUpperCase())) return a
    if (b.toUpperCase().includes(a.toUpperCase())) return b
  }
  return parts.join(' - ')
}

// ─── Parser ──────────────────────────────────────────────────
export function parseOfx(text: string, opts: ParseOptions = {}): OfxResult {
  const warnings: string[] = []
  const start = text.search(/<OFX[\s>]/i)
  if (start < 0) throw new Error('Arquivo não parece ser um OFX (tag <OFX> não encontrada).')
  const body = text.slice(start)

  const statements: OfxStatement[] = []
  const stack: string[] = []
  let stmt: OfxStatement | null = null
  let trn: Record<string, string> | null = null
  let stmtTrnCount = 0

  const finishTrn = () => {
    if (!stmt || !trn) return
    stmtTrnCount++
    const data = trn.DTPOSTED ? parseOfxDate(trn.DTPOSTED) : null
    const amount = trn.TRNAMT !== undefined ? parseOfxAmount(trn.TRNAMT) : null
    if (!data || amount === null) {
      warnings.push(`Lançamento ${stmtTrnCount} ignorado: data ou valor ilegíveis (FITID ${trn.FITID ?? 'ausente'}).`)
      return
    }
    const name = trn.NAME ?? trn.PAYEE ?? null
    const memo = trn.MEMO ?? null
    stmt.transacoes.push({
      fitid: trn.FITID?.trim() || null,
      tipoOfx: trn.TRNTYPE?.trim() || null,
      data,
      valor: opts.invertSign ? -amount : amount,
      descricao: combineDescription(name, memo),
      name, memo,
    })
  }

  const tagRe = /<(\/?)([A-Za-z0-9_.]+)>([^<]*)/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(body))) {
    const closing = m[1] === '/'
    const tag = m[2].toUpperCase()
    const value = decodeEntities(m[3]).trim()

    if (AGGREGATES.has(tag)) {
      if (closing) {
        const i = stack.lastIndexOf(tag)
        if (i >= 0) stack.length = i
        if (tag === 'STMTTRN') { finishTrn(); trn = null }
        if (tag === 'STMTRS' || tag === 'CCSTMTRS') { if (stmt) statements.push(stmt); stmt = null }
      } else {
        stack.push(tag)
        if (tag === 'STMTRS' || tag === 'CCSTMTRS') {
          stmt = {
            kind: tag === 'CCSTMTRS' ? 'cartao' : 'conta',
            moeda: null, bankId: null, acctId: null, acctType: null, inicio: null, fim: null, transacoes: [],
          }
          stmtTrnCount = 0
        }
        if (tag === 'STMTTRN') trn = {}
      }
      continue
    }

    // Folha: so conta a abertura com valor (a tag de fechamento do XML e ignorada).
    if (closing || value === '') continue
    if (trn && stack[stack.length - 1] === 'STMTTRN') { trn[tag] = value; continue }
    if (!stmt) continue
    const parent = stack[stack.length - 1]
    if (tag === 'CURDEF') stmt.moeda = value
    else if (parent === 'BANKACCTFROM' || parent === 'CCACCTFROM') {
      if (tag === 'BANKID') stmt.bankId = value
      else if (tag === 'ACCTID') stmt.acctId = value
      else if (tag === 'ACCTTYPE') stmt.acctType = value
    } else if (parent === 'BANKTRANLIST') {
      if (tag === 'DTSTART') stmt.inicio = parseOfxDate(value)
      else if (tag === 'DTEND') stmt.fim = parseOfxDate(value)
    }
  }
  if (stmt) {
    warnings.push('Arquivo terminou no meio de um extrato; os lançamentos lidos foram mantidos.')
    statements.push(stmt)
  }

  if (statements.length === 0) {
    throw new Error('Nenhum extrato (STMTRS ou CCSTMTRS) encontrado no OFX.')
  }
  for (const s of statements) {
    const seen = new Set<string>()
    for (const t of s.transacoes) {
      if (!t.fitid) continue
      if (seen.has(t.fitid)) warnings.push(`FITID repetido no mesmo extrato: ${t.fitid}. A deduplicação pode confundir lançamentos distintos.`)
      seen.add(t.fitid)
    }
    if (s.transacoes.some(t => !t.fitid)) {
      warnings.push('Há lançamentos sem FITID: eles não podem ser deduplicados em novas importações.')
    }
  }
  return { statements, warnings }
}

export function parseOfxBytes(bytes: ArrayBuffer | Uint8Array, opts: ParseOptions = {}): OfxResult {
  return parseOfx(decodeOfx(bytes), opts)
}

// ─── Ponte para o motor de transferencias ───────────────────────
export interface OfxRow {
  externalId: string | null
  data: string
  descricao: string
  valor: number // positivo
  tipo: 'despesa' | 'receita'
}

// Valor negativo = saida (despesa); positivo = entrada (receita). Zeros sao descartados.
export function ofxToRows(statement: OfxStatement): OfxRow[] {
  return statement.transacoes
    .filter(t => t.valor !== 0)
    .map(t => ({
      externalId: t.fitid,
      data: t.data,
      descricao: t.descricao,
      valor: Math.round(Math.abs(t.valor) * 100) / 100,
      tipo: t.valor < 0 ? 'despesa' : 'receita',
    }))
}

// Ajuda a sugerir a conta cadastrada: o "final" (3 a 6 digitos) costuma ser o fim do ACCTID.
export function accountFinalMatches(final: string | null | undefined, acctId: string | null): boolean {
  if (!final || !acctId) return false
  const digits = acctId.replace(/\D/g, '')
  return digits.endsWith(final)
}
