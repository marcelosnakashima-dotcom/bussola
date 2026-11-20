// Parâmetros de URL das telas de Despesas e Receitas (validados: nada vira consulta sem checar).
import type { Classe, Periodo } from '@/lib/finance'

export interface MovSearch {
  mes?: string
  periodo?: Periodo
  classe?: Classe
  categoria?: string
  conta?: string
  q?: string
  dia?: string
}

const PERIODOS: Periodo[] = ['mes', '3m', '6m', '12m']
const CLASSES: Classe[] = ['necessidade', 'desejo', 'poupanca']
const str = (v: unknown, max = 80) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined)

export function validateMovSearch(s: Record<string, unknown>): MovSearch {
  const mes = str(s.mes)
  return {
    mes: mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : undefined,
    periodo: PERIODOS.includes(s.periodo as Periodo) ? (s.periodo as Periodo) : undefined,
    classe: CLASSES.includes(s.classe as Classe) ? (s.classe as Classe) : undefined,
    categoria: str(s.categoria, 40),
    conta: str(s.conta, 40),
    q: str(s.q, 60),
    dia: typeof s.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.dia) ? s.dia : undefined,
  }
}
