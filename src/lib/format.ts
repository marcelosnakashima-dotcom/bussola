// Formatadores de valores para telas e gráficos (pt-BR).

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// R$ 12,3 mil / R$ 1,2 mi — para eixos e cards pequenos
export function brlCompact(v: number): string {
  const abs = Math.abs(v)
  const sinal = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `${sinal}R$ ${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

export const pct = (v: number, digits = 0) =>
  `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`

// Variação percentual entre dois valores; null quando a base é zero.
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return ((atual - anterior) / Math.abs(anterior)) * 100
}

export function mesCurto(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  const nome = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' })
  return nome.replace('.', '')
}
