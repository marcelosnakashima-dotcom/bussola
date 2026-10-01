import { describe, it, expect } from 'vitest'
import {
  parseOfx, parseOfxBytes, decodeOfx, parseOfxDate, parseOfxAmount, ofxToRows, accountFinalMatches,
} from './ofxParser'

// Fixtures 100% sinteticas: instituicoes, contas, nomes e valores sao inventados.
const SGML_HEADER = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

`

// OFX 1.x: folhas SEM tag de fechamento, agregados fechados.
const SGML_CONTA = `${SGML_HEADER}<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260930120000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901000000[-3:BRT]<DTEND>20260930000000[-3:BRT]
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905000000[-3:BRT]<TRNAMT>5000.00<FITID>AAA1<NAME>CREDITO SALARIO<MEMO>EMPRESA EXEMPLO LTDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910120000<TRNAMT>-300.50<FITID>AAA2<MEMO>Pix enviado - ANA EXEMPLO SILVA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912<TRNAMT>-1.234,56<FITID>AAA3<NAME>Padaria &amp; Cia<MEMO></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>100.00<DTASOF>20260930</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`

const XML_CARTAO = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <TRNUID>1</TRNUID>
      <CCSTMTRS>
        <CURDEF>BRL</CURDEF>
        <CCACCTFROM><ACCTID>9876543210</ACCTID></CCACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20260801</DTSTART>
          <DTEND>20260831</DTEND>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260815000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-89.90</TRNAMT>
            <FITID>CC-1</FITID>
            <MEMO>Café São João</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20260820</DTPOSTED>
            <TRNAMT>1500.00</TRNAMT>
            <FITID>CC-2</FITID>
            <MEMO>Pagamento recebido</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`

// Codifica como latin-1/cp1252 (os caracteres usados aqui coincidem nas duas tabelas).
const latin1 = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))

describe('OFX 1.x (SGML) de conta corrente', () => {
  const { statements, warnings } = parseOfx(SGML_CONTA)
  const st = statements[0]

  it('lê cabeçalho da conta e período', () => {
    expect(statements).toHaveLength(1)
    expect(st).toMatchObject({
      kind: 'conta', moeda: 'BRL', bankId: '0001', acctId: '12345-6', acctType: 'CHECKING',
      inicio: '2026-09-01', fim: '2026-09-30',
    })
  })
  it('lê os três lançamentos com data, valor com sinal e FITID', () => {
    expect(st.transacoes.map(t => [t.fitid, t.data, t.valor])).toEqual([
      ['AAA1', '2026-09-05', 5000],
      ['AAA2', '2026-09-10', -300.5],
      ['AAA3', '2026-09-12', -1234.56],
    ])
  })
  it('combina NAME e MEMO, aceita só MEMO e decodifica entidades', () => {
    expect(st.transacoes[0].descricao).toBe('CREDITO SALARIO - EMPRESA EXEMPLO LTDA')
    expect(st.transacoes[1].descricao).toBe('Pix enviado - ANA EXEMPLO SILVA')
    expect(st.transacoes[2].descricao).toBe('Padaria & Cia') // MEMO vazio nao polui
  })
  it('data ignora fuso: 20260910120000 e 20260905000000[-3:BRT] não mudam de dia', () => {
    expect(st.transacoes[1].data).toBe('2026-09-10')
    expect(st.transacoes[0].data).toBe('2026-09-05')
  })
  it('sem avisos quando o arquivo está íntegro', () => {
    expect(warnings).toEqual([])
  })
})

describe('OFX 2.x (XML) de cartão', () => {
  const { statements } = parseOfx(XML_CARTAO)
  const st = statements[0]
  it('reconhece extrato de cartão (CCSTMTRS) e o ACCTID', () => {
    expect(st.kind).toBe('cartao')
    expect(st.acctId).toBe('9876543210')
    expect(st.inicio).toBe('2026-08-01')
  })
  it('lê lançamentos com tags de fechamento nas folhas', () => {
    expect(st.transacoes).toHaveLength(2)
    expect(st.transacoes[0]).toMatchObject({ fitid: 'CC-1', data: '2026-08-15', valor: -89.9, descricao: 'Café São João' })
    expect(st.transacoes[1].valor).toBe(1500)
  })
})

describe('acentos e codificação', () => {
  it('windows-1252 declarado: acentos e travessão (byte 0x96) corretos', () => {
    // O travessao nao existe em latin-1 puro: no cp1252 e o byte 0x96.
    const texto = SGML_CONTA.replace('Pix enviado - ANA EXEMPLO SILVA', 'Pagamento Condomínio \u2013 Ação')
    const bytes = Uint8Array.from(texto, c => (c === '\u2013' ? 0x96 : c.charCodeAt(0)))
    const out = parseOfxBytes(bytes)
    expect(out.statements[0].transacoes[1].descricao).toBe('Pagamento Condomínio \u2013 Ação')
  })
  it('sem declaração, bytes latin-1 inválidos em UTF-8 caem para windows-1252', () => {
    const semHeader = SGML_CONTA.replace(/CHARSET:1252\n/, '').replace('Padaria &amp; Cia', 'Açaí')
    expect(parseOfxBytes(latin1(semHeader)).statements[0].transacoes[2].descricao).toBe('Açaí')
  })
  it('UTF-8 declarado é respeitado', () => {
    const xml = new TextEncoder().encode(XML_CARTAO)
    expect(parseOfxBytes(xml).statements[0].transacoes[0].descricao).toBe('Café São João')
  })
  it('decodeOfx aceita ArrayBuffer', () => {
    const buf = new TextEncoder().encode(XML_CARTAO).buffer
    expect(decodeOfx(buf)).toContain('Café São João')
  })
})

describe('valores e datas', () => {
  it('parseOfxAmount cobre ponto, vírgula e milhar', () => {
    expect(parseOfxAmount('1234.56')).toBe(1234.56)
    expect(parseOfxAmount('-1.234,56')).toBe(-1234.56)
    expect(parseOfxAmount('1,234.56')).toBe(1234.56)
    expect(parseOfxAmount('-0,50')).toBe(-0.5)
    expect(parseOfxAmount('+10')).toBe(10)
    expect(parseOfxAmount('abc')).toBeNull()
  })
  it('parseOfxDate rejeita datas inválidas', () => {
    expect(parseOfxDate('20261301')).toBeNull()
    expect(parseOfxDate('2026')).toBeNull()
    expect(parseOfxDate('20260229')).toBe('2026-02-29') // so valida formato; calendario real fica a cargo de quem consome
  })
})

describe('robustez', () => {
  it('lança erro claro para arquivo que não é OFX', () => {
    expect(() => parseOfx('%PDF-1.4 ...')).toThrow(/OFX/)
  })
  it('lança erro quando não há extrato', () => {
    expect(() => parseOfx('<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>')).toThrow(/extrato/)
  })
  it('ignora lançamento ilegível com aviso, mantendo os outros', () => {
    const quebrado = SGML_CONTA.replace('<TRNAMT>-300.50', '<TRNAMT>lixo')
    const { statements, warnings } = parseOfx(quebrado)
    expect(statements[0].transacoes).toHaveLength(2)
    expect(warnings.join(' ')).toMatch(/ilegíveis/)
  })
  it('avisa FITID repetido e ausente', () => {
    const rep = SGML_CONTA.replace('AAA2', 'AAA1').replace('<FITID>AAA3', '<X>')
    const w = parseOfx(rep).warnings.join(' ')
    expect(w).toMatch(/FITID repetido/)
    expect(w).toMatch(/sem FITID/)
  })
  it('arquivo truncado mantém o que foi lido, com aviso', () => {
    const cortado = SGML_CONTA.slice(0, SGML_CONTA.indexOf('</BANKTRANLIST>'))
    const out = parseOfx(cortado)
    expect(out.statements[0].transacoes.length).toBeGreaterThan(0)
    expect(out.warnings.join(' ')).toMatch(/terminou no meio/)
  })
  it('vários extratos no mesmo arquivo', () => {
    const dois = SGML_CONTA.replace('</BANKMSGSRSV1>', '</BANKMSGSRSV1>') // base
      .replace('</STMTRS></STMTTRNRS>', '</STMTRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>0002<ACCTID>777<ACCTTYPE>SAVINGS</BANKACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260920<TRNAMT>10.00<FITID>B1<NAME>X</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS>')
    const { statements } = parseOfx(dois)
    expect(statements).toHaveLength(2)
    expect(statements[1]).toMatchObject({ acctId: '777', acctType: 'SAVINGS' })
    expect(statements[1].transacoes).toHaveLength(1)
  })
  it('invertSign troca o sinal de todos os lançamentos', () => {
    const { statements } = parseOfx(XML_CARTAO, { invertSign: true })
    expect(statements[0].transacoes.map(t => t.valor)).toEqual([89.9, -1500])
  })
})

describe('ponte para o motor', () => {
  it('converte sinal em tipo, valor positivo e preserva FITID como externalId', () => {
    const rows = ofxToRows(parseOfx(SGML_CONTA).statements[0])
    expect(rows.map(r => [r.externalId, r.tipo, r.valor])).toEqual([
      ['AAA1', 'receita', 5000],
      ['AAA2', 'despesa', 300.5],
      ['AAA3', 'despesa', 1234.56],
    ])
  })
  it('descarta lançamentos de valor zero', () => {
    const z = SGML_CONTA.replace('<TRNAMT>-300.50', '<TRNAMT>0.00')
    expect(ofxToRows(parseOfx(z).statements[0])).toHaveLength(2)
  })
  it('sugere conta pelo final do ACCTID', () => {
    expect(accountFinalMatches('3456', '12345-6')).toBe(true) // digitos: 123456
    expect(accountFinalMatches('999', '12345-6')).toBe(false)
    expect(accountFinalMatches(null, '12345-6')).toBe(false)
  })
})
