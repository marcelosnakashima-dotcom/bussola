// Simulador de custo: financiamento bancário vs. consórcio.
//
// IMPORTANTE: os parâmetros abaixo (taxas, prazos, correção) são MÉDIAS DE
// MERCADO aproximadas, usadas como ponto de partida editável pelo usuário.
// Não são uma oferta, cotação oficial ou recomendação financeira — cada
// instituição/administradora tem condições próprias. Sempre confirme os
// números reais com o banco ou a administradora antes de decidir.

export type TipoBem = 'imovel' | 'carro' | 'viagem'
export type Modalidade = 'financiamento' | 'consorcio'
export type SistemaAmortizacao = 'SAC' | 'PRICE'

export interface ParametrosFinanciamento {
  sistema: SistemaAmortizacao
  taxaAnual: number     // ex.: 0.11 = 11% a.a.
  prazoMeses: number
  entradaMinPct: number // ex.: 0.20 = 20%
}

export interface ParametrosConsorcio {
  taxaAdministracaoTotal: number // ex.: 0.18 = 18% do valor do bem, diluído no prazo
  fundoReservaTotal: number      // ex.: 0.02 = 2%
  prazoMeses: number
  correcaoAnual: number          // reajuste anual do saldo (INCC p/ imóvel, IPCA p/ os demais)
}

export interface ParametrosBem {
  label: string
  icone: string
  financiamento: ParametrosFinanciamento
  consorcio: ParametrosConsorcio
}

export const PRESETS: Record<TipoBem, ParametrosBem> = {
  imovel: {
    label: 'Imóvel',
    icone: '🏠',
    financiamento: { sistema: 'SAC', taxaAnual: 0.11, prazoMeses: 360, entradaMinPct: 0.20 },
    consorcio: { taxaAdministracaoTotal: 0.18, fundoReservaTotal: 0.02, prazoMeses: 200, correcaoAnual: 0.06 },
  },
  carro: {
    label: 'Carro',
    icone: '🚗',
    financiamento: { sistema: 'PRICE', taxaAnual: 0.22, prazoMeses: 60, entradaMinPct: 0.20 },
    consorcio: { taxaAdministracaoTotal: 0.16, fundoReservaTotal: 0.01, prazoMeses: 80, correcaoAnual: 0.05 },
  },
  viagem: {
    label: 'Viagem',
    icone: '✈️',
    financiamento: { sistema: 'PRICE', taxaAnual: 0.38, prazoMeses: 24, entradaMinPct: 0 },
    consorcio: { taxaAdministracaoTotal: 0.14, fundoReservaTotal: 0.01, prazoMeses: 36, correcaoAnual: 0.05 },
  },
}

function taxaMensalEquivalente(taxaAnual: number): number {
  return Math.pow(1 + taxaAnual, 1 / 12) - 1
}

export interface ResultadoFinanciamento {
  parcelaInicial: number
  parcelaFinal: number
  totalPago: number
  totalJuros: number
}

export function calcularFinanciamento(
  valorFinanciado: number,
  params: ParametrosFinanciamento
): ResultadoFinanciamento {
  const i = taxaMensalEquivalente(params.taxaAnual)
  const n = params.prazoMeses

  if (params.sistema === 'PRICE') {
    const parcela =
      i === 0
        ? valorFinanciado / n
        : (valorFinanciado * (i * Math.pow(1 + i, n))) / (Math.pow(1 + i, n) - 1)
    const totalPago = parcela * n
    return { parcelaInicial: parcela, parcelaFinal: parcela, totalPago, totalJuros: totalPago - valorFinanciado }
  }

  // SAC: amortização constante, parcela decrescente
  const amortizacao = valorFinanciado / n
  const parcelaInicial = amortizacao + valorFinanciado * i
  let saldo = valorFinanciado
  let totalPago = 0
  for (let m = 0; m < n; m++) {
    const juros = saldo * i
    totalPago += amortizacao + juros
    saldo -= amortizacao
  }
  const parcelaFinal = amortizacao + amortizacao * i
  return { parcelaInicial, parcelaFinal, totalPago, totalJuros: totalPago - valorFinanciado }
}

export interface ResultadoConsorcio {
  parcelaInicial: number
  custoTotalEstimado: number
  taxasTotais: number
}

export function calcularConsorcio(valorBem: number, params: ParametrosConsorcio): ResultadoConsorcio {
  const taxasTotais = valorBem * (params.taxaAdministracaoTotal + params.fundoReservaTotal)
  const valorTotalNominal = valorBem + taxasTotais
  const parcelaInicial = valorTotalNominal / params.prazoMeses

  // Aproximação do efeito da correção monetária anual sobre o saldo devedor
  // médio ao longo do prazo (não é uma projeção exata, é uma estimativa).
  const anos = params.prazoMeses / 12
  const fatorCorrecaoMedio = Math.pow(1 + params.correcaoAnual, anos / 2)
  const custoTotalEstimado = valorTotalNominal * fatorCorrecaoMedio

  return { parcelaInicial, custoTotalEstimado, taxasTotais }
}

export interface ComparativoBem {
  tipoBem: TipoBem
  valorBem: number
  financiamento: ResultadoFinanciamento & { valorFinanciado: number; entrada: number }
  consorcio: ResultadoConsorcio
}

export function compararBem(tipoBem: TipoBem, valorBem: number, overrides?: {
  financiamento?: Partial<ParametrosFinanciamento>
  consorcio?: Partial<ParametrosConsorcio>
}): ComparativoBem {
  const preset = PRESETS[tipoBem]
  const paramsFin = { ...preset.financiamento, ...overrides?.financiamento }
  const paramsCons = { ...preset.consorcio, ...overrides?.consorcio }

  const entrada = valorBem * paramsFin.entradaMinPct
  const valorFinanciado = valorBem - entrada
  const resFin = calcularFinanciamento(valorFinanciado, paramsFin)
  const resCons = calcularConsorcio(valorBem, paramsCons)

  return {
    tipoBem,
    valorBem,
    financiamento: { ...resFin, valorFinanciado, entrada },
    consorcio: resCons,
  }
}
