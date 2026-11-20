// Regras da área do administrador (puro, testado).

export type Situacao = 'em_dia' | 'atencao' | 'parado' | 'sem_dados'

export const SITUACAO_LABEL: Record<Situacao, string> = {
  em_dia: 'Em dia', atencao: 'Atenção', parado: 'Parado', sem_dados: 'Sem dados',
}

const dias = (deIso: string, hoje: Date) => {
  const [y, m, d] = deIso.slice(0, 10).split('-').map(Number)
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  return Math.floor((base - Date.UTC(y, m - 1, d)) / 86_400_000)
}

// Pela data do último lançamento: até 35 dias em dia, até 60 atenção, depois parado.
export function situacaoCliente(ultimoLancamento: string | null, hoje = new Date()): { situacao: Situacao; dias: number | null } {
  if (!ultimoLancamento) return { situacao: 'sem_dados', dias: null }
  const d = dias(ultimoLancamento, hoje)
  return { situacao: d <= 35 ? 'em_dia' : d <= 60 ? 'atencao' : 'parado', dias: d }
}

// "hoje", "ontem", "há 5 dias", "há 3 meses", "nunca"
export function tempoDesde(iso: string | null, hoje = new Date()): string {
  if (!iso) return 'nunca'
  const d = dias(iso, hoje)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 31) return `há ${d} dias`
  const meses = Math.floor(d / 30)
  return meses < 12 ? `há ${meses} ${meses === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(meses / 12)} ano${meses >= 24 ? 's' : ''}`
}

// Busca por nome ou e-mail de qualquer membro, sem acento e sem caixa.
export function casaBusca(membros: { nome: string; email: string | null }[], busca: string): boolean {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = n(busca.trim())
  if (!q) return true
  return membros.some(m => n(m.nome).includes(q) || n(m.email ?? '').includes(q))
}
