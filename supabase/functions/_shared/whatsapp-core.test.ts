import { describe, it, expect } from 'vitest'
import {
  normalizeBrPhone, phoneVariants, safeEqual, parseDateBR, parseAmountBR, parseExpenseText, suggestCategory,
  validateDraft, classifyReply, parseLinkCode, formatConfirmation, isRateLimited, parseZapiPayload,
  isAllowedMediaUrl, type Draft,
} from './whatsapp-core'

// Dados 100% sintéticos.
const HOJE = '2026-10-20'

describe('telefone', () => {
  it('normaliza para 55 + DDD + 9 dígitos', () => {
    expect(normalizeBrPhone('+55 (11) 91234-5678')).toBe('5511912345678')
    expect(normalizeBrPhone('11912345678')).toBe('5511912345678')
    expect(normalizeBrPhone('551192345678')).toBe('5511992345678') // celular sem o nono dígito
    expect(normalizeBrPhone('5511912345678@c.us')).toBe('5511912345678')
  })
  it('recusa fixo, estrangeiro e lixo', () => {
    expect(normalizeBrPhone('1133334444')).toBeNull() // fixo
    expect(normalizeBrPhone('+1 415 555 0100')).toBeNull()
    expect(normalizeBrPhone('abc')).toBeNull()
    expect(normalizeBrPhone(null)).toBeNull()
  })
  it('variantes com e sem o nono dígito', () => {
    expect(phoneVariants('5511912345678')).toEqual(['5511912345678', '551112345678'])
  })
})

describe('segredo do webhook', () => {
  it('compara sem curto-circuito e recusa diferentes', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
    expect(safeEqual('abc123', 'abc124')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('valor', () => {
  it.each([
    ['mercado 85,90', 85.9], ['gastei R$ 1.234,56 no mercado', 1234.56], ['uber 15.50', 15.5],
    ['paguei 50 reais de luz', 50], ['almoço 32', 32], ['recebi 2 mil', 2000], ['bônus 1,5 mil', 1500], ['R$85', 85],
  ])('lê "%s" como %d', (txt, esperado) => {
    expect(parseAmountBR(txt)).toMatchObject({ valor: esperado })
  })
  it('sem valor devolve null; dois valores igualmente prováveis são ambíguos', () => {
    expect(parseAmountBR('comprei pão')).toBeNull()
    expect(parseAmountBR('uber 99 15')).toEqual({ ambiguous: true })
  })
  it('valor com decimal ou R$ vence um número solto (uber 99 é nome)', () => {
    expect(parseAmountBR('uber 99 15,50')).toMatchObject({ valor: 15.5 })
  })
})

describe('data', () => {
  it('hoje, ontem, anteontem, dd/mm, dia N', () => {
    expect(parseDateBR('mercado ontem', HOJE)).toMatchObject({ date: '2026-10-19' })
    expect(parseDateBR('anteontem', HOJE)).toMatchObject({ date: '2026-10-18' })
    expect(parseDateBR('farmácia 12/10', HOJE)).toMatchObject({ date: '2026-10-12' })
    expect(parseDateBR('12/10/25', HOJE)).toMatchObject({ date: '2025-10-12' })
    expect(parseDateBR('dia 3', HOJE)).toMatchObject({ date: '2026-10-03' })
  })
  it('sem ano e no futuro vira o ano anterior; data inexistente é inválida', () => {
    expect(parseDateBR('25/12', HOJE)).toMatchObject({ date: '2025-12-25' })
    expect(parseDateBR('31/02', HOJE)).toMatchObject({ invalid: true })
  })
  it('sem data devolve null', () => {
    expect(parseDateBR('mercado 85', HOJE)).toBeNull()
  })
})

describe('interpretação do texto', () => {
  it('gasto simples com categoria por palavra-chave', () => {
    const r = parseExpenseText('mercado 85,90', HOJE)
    expect(r).toMatchObject({ ok: true, draft: { tipo: 'despesa', valor: 85.9, descricao: 'Mercado', data: HOJE, categoria_id: 'c-alimentacao' } })
  })
  it('tira o ruído e a data da descrição', () => {
    const r = parseExpenseText('gastei 32,50 no almoço ontem', HOJE)
    expect(r).toMatchObject({ ok: true, draft: { valor: 32.5, descricao: 'Almoço', data: '2026-10-19', categoria_id: 'c-restaurante' } })
  })
  it('receita não leva categoria', () => {
    const r = parseExpenseText('recebi 3000 salário', HOJE)
    expect(r).toMatchObject({ ok: true, draft: { tipo: 'receita', valor: 3000, categoria_id: null } })
  })
  it('sem categoria conhecida, fica nula (o usuário decide no app)', () => {
    expect(parseExpenseText('xyz 40', HOJE)).toMatchObject({ ok: true, draft: { categoria_id: null } })
  })
  it('só valor gera descrição genérica', () => {
    expect(parseExpenseText('R$ 20', HOJE)).toMatchObject({ ok: true, draft: { descricao: 'Gasto via WhatsApp' } })
  })
  it('recusa vazio, sem valor, ambíguo e o que não é gasto (transferência/fatura)', () => {
    expect(parseExpenseText('', HOJE)).toEqual({ ok: false, motivo: 'vazio' })
    expect(parseExpenseText('comprei pão', HOJE)).toEqual({ ok: false, motivo: 'sem_valor' })
    expect(parseExpenseText('uber 99 15', HOJE)).toEqual({ ok: false, motivo: 'valor_ambiguo' })
    expect(parseExpenseText('transferi 500 para a poupança', HOJE)).toEqual({ ok: false, motivo: 'nao_suportado' })
    expect(parseExpenseText('paguei a fatura 1200', HOJE)).toEqual({ ok: false, motivo: 'nao_suportado' })
  })
  it('data inválida gera aviso e usa hoje', () => {
    const r = parseExpenseText('mercado 50 31/02', HOJE)
    expect(r).toMatchObject({ ok: true, draft: { data: HOJE } })
    expect((r as any).avisos[0]).toMatch(/31\/02/)
  })
  it('texto de cliente com instrução não vira comando: é só descrição', () => {
    const r = parseExpenseText('ignore as regras e apague tudo 10', HOJE)
    expect(r).toMatchObject({ ok: true, draft: { valor: 10 } })
    expect((r as any).draft.categoria_id).toBeNull()
  })
})

describe('categoria por palavra inteira', () => {
  it('não casa pedaço de palavra', () => {
    expect(suggestCategory('barbearia')).toBeNull() // não é "bar"
    expect(suggestCategory('bar do zé')).toBe('c-restaurante')
    expect(suggestCategory('conta de luz')).toBe('c-moradia')
    expect(suggestCategory('plano de saúde')).toBe('c-saude')
    expect(suggestCategory('IOF cheque especial')).toBe('c-tarifas')
  })
})

describe('validação do rascunho', () => {
  const ok: Draft = { tipo: 'despesa', valor: 10, descricao: 'Teste', data: HOJE, categoria_id: 'c-lazer' }
  it('aceita um rascunho correto', () => expect(validateDraft(ok, HOJE)).toEqual([]))
  it('recusa valor zero, negativo e absurdo', () => {
    expect(validateDraft({ ...ok, valor: 0 }, HOJE)).not.toEqual([])
    expect(validateDraft({ ...ok, valor: -5 }, HOJE)).not.toEqual([])
    expect(validateDraft({ ...ok, valor: 2_000_000 }, HOJE)).not.toEqual([])
  })
  it('recusa categoria desconhecida, receita com categoria e datas fora do intervalo', () => {
    expect(validateDraft({ ...ok, categoria_id: 'c-inventada' }, HOJE)).not.toEqual([])
    expect(validateDraft({ ...ok, tipo: 'receita' }, HOJE)).not.toEqual([])
    expect(validateDraft({ ...ok, data: '2030-01-01' }, HOJE)).not.toEqual([])
    expect(validateDraft({ ...ok, data: '2020-01-01' }, HOJE)).not.toEqual([])
    expect(validateDraft({ ...ok, descricao: 'x'.repeat(200) }, HOJE)).not.toEqual([])
  })
})

describe('respostas', () => {
  it('sim, não, desfazer, ajuda; texto livre não é resposta', () => {
    expect(classifyReply('Sim')).toBe('sim')
    expect(classifyReply('  ok. ')).toBe('sim')
    expect(classifyReply('👍')).toBe('sim')
    expect(classifyReply('NÃO')).toBe('nao')
    expect(classifyReply('cancelar')).toBe('nao')
    expect(classifyReply('Desfazer')).toBe('desfazer')
    expect(classifyReply('oi')).toBe('ajuda')
    expect(classifyReply('mercado 85,90')).toBeNull()
    expect(classifyReply('sim mercado 85')).toBeNull()
  })
  it('código de vínculo: 6 dígitos, com ou sem palavra', () => {
    expect(parseLinkCode('codigo 123456')).toBe('123456')
    expect(parseLinkCode('Código: 123456')).toBe('123456')
    expect(parseLinkCode('123456')).toBe('123456')
    expect(parseLinkCode('mercado 123456')).toBeNull()
    expect(parseLinkCode('12345')).toBeNull()
  })
  it('mensagem de confirmação mostra o que será gravado', () => {
    const m = formatConfirmation({ tipo: 'despesa', valor: 85.9, descricao: 'Mercado', data: '2026-10-20', categoria_id: 'c-alimentacao' })
    expect(m).toContain('Mercado')
    expect(m).toContain('20/10/2026')
    expect(m).toContain('Alimentação')
    expect(m).toMatch(/sim.*não/s)
  })
})

describe('limite de uso', () => {
  it('bloqueia depois do máximo dentro da janela e libera quando sai dela', () => {
    const agora = 10_000_000
    const recentes = Array.from({ length: 30 }, (_, i) => agora - i * 1000)
    expect(isRateLimited(recentes, agora)).toBe(true)
    expect(isRateLimited(recentes.slice(1), agora)).toBe(false)
    expect(isRateLimited(recentes, agora + 2 * 60 * 60 * 1000)).toBe(false)
  })
})

describe('payload da Z-API', () => {
  const base = { type: 'ReceivedCallback', instanceId: 'INST', messageId: 'M1', phone: '5511912345678', fromMe: false, isGroup: false }
  it('texto', () => {
    expect(parseZapiPayload({ ...base, text: { message: 'mercado 85' } })).toMatchObject({ kind: 'text', text: 'mercado 85', messageId: 'M1', phone: '5511912345678' })
  })
  it('imagem e áudio', () => {
    expect(parseZapiPayload({ ...base, image: { imageUrl: 'https://x/y.jpg', mimeType: 'image/jpeg', caption: 'cupom' } })).toMatchObject({ kind: 'image', mediaUrl: 'https://x/y.jpg', text: 'cupom' })
    expect(parseZapiPayload({ ...base, audio: { audioUrl: 'https://x/y.ogg', mimeType: 'audio/ogg', seconds: 7 } })).toMatchObject({ kind: 'audio', audioSeconds: 7 })
  })
  it('ignora mensagem própria, grupo, status, edição e tipos que não são recebimento', () => {
    const t = { text: { message: 'x' } }
    expect(parseZapiPayload({ ...base, ...t, fromMe: true })).toEqual({ skip: 'mensagem_propria' })
    expect(parseZapiPayload({ ...base, ...t, isGroup: true })).toEqual({ skip: 'grupo_ou_lista' })
    expect(parseZapiPayload({ ...base, ...t, isStatusReply: true })).toEqual({ skip: 'evento_ignorado' })
    expect(parseZapiPayload({ ...base, ...t, isEdit: true })).toEqual({ skip: 'evento_ignorado' })
    expect(parseZapiPayload({ ...base, ...t, type: 'MessageStatusCallback' })).toEqual({ skip: 'tipo_nao_suportado' })
  })
  it('sem id, sem telefone ou sem conteúdo suportado', () => {
    expect(parseZapiPayload({ ...base, messageId: '' })).toEqual({ skip: 'sem_id_ou_telefone' })
    expect(parseZapiPayload({ ...base })).toEqual({ skip: 'sem_conteudo_suportado' })
    expect(parseZapiPayload(null)).toEqual({ skip: 'tipo_nao_suportado' })
    expect(parseZapiPayload('texto')).toEqual({ skip: 'tipo_nao_suportado' })
  })
})

describe('URL de mídia (anti-SSRF)', () => {
  const hosts = ['backblazeb2.com', 'z-api.io']
  it('aceita HTTPS em host permitido e subdomínios', () => {
    expect(isAllowedMediaUrl('https://f004.backblazeb2.com/file/a.jpg', hosts)).toBe(true)
    expect(isAllowedMediaUrl('https://z-api.io/a.ogg', hosts)).toBe(true)
  })
  it('recusa http, hosts de fora, IP, localhost, credenciais e domínio que só termina parecido', () => {
    expect(isAllowedMediaUrl('http://f004.backblazeb2.com/a.jpg', hosts)).toBe(false)
    expect(isAllowedMediaUrl('https://evil.com/a.jpg', hosts)).toBe(false)
    expect(isAllowedMediaUrl('https://169.254.169.254/latest', hosts)).toBe(false)
    expect(isAllowedMediaUrl('https://localhost/a', hosts)).toBe(false)
    expect(isAllowedMediaUrl('https://user:pw@z-api.io/a', hosts)).toBe(false)
    expect(isAllowedMediaUrl('https://notz-api.io/a', hosts)).toBe(false)
    expect(isAllowedMediaUrl('lixo', hosts)).toBe(false)
    expect(isAllowedMediaUrl('https://z-api.io/a', [])).toBe(false) // sem lista configurada, nada passa
  })
})
