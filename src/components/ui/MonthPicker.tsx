import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, monthLabel } from '@/lib/finance'

export const currentMonthKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Navega mês a mês; não passa do mês atual.
export function MonthPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const atual = currentMonthKey()
  const podeAvancar = value < atual
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => onChange(addMonths(value, -1))} aria-label="Mês anterior"
        className="p-2 text-muted hover:text-ink"><ChevronLeft className="w-4 h-4" /></button>
      <span className="px-1 min-w-[132px] text-center text-sm font-medium text-ink" aria-live="polite">{monthLabel(value)}</span>
      <button type="button" onClick={() => podeAvancar && onChange(addMonths(value, 1))} disabled={!podeAvancar} aria-label="Próximo mês"
        className="p-2 text-muted hover:text-ink disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
    </div>
  )
}
