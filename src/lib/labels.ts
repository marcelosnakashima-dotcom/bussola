import type { Asset, Debt } from '@/lib/supabase'

export const ASSET_LABEL: Record<Asset['tipo'], string> = {
  reserva: 'Reserva', consorcio: 'Consórcio', previdencia: 'Previdência',
  seguro: 'Seguro', investimento: 'Investimento', imovel: 'Imóvel', outro: 'Outro',
}

export const DEBT_LABEL: Record<Debt['tipo'], string> = {
  financiamento_imovel: 'Financiamento imobiliário',
  financiamento_veiculo: 'Financiamento de veículo',
  emprestimo: 'Empréstimo',
  cartao_credito: 'Cartão de crédito',
  terceiros: 'Dívida com terceiros',
  outro: 'Outro',
}
