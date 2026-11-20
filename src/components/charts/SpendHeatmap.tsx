import { useState } from 'react'
import { brl } from '@/lib/format'
import { firstWeekday, type DiaTotal } from '@/lib/finance'

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// Calendário do mês com a intensidade do gasto em cada dia. Passar o mouse mostra o
// resumo do dia; clicar seleciona o dia (clicar de novo limpa).
export function SpendHeatmap({ dias, mes, color = 'var(--danger)', selected, onSelect, hoje }: {
  dias: DiaTotal[]
  mes: string
  color?: string
  selected?: string | null
  onSelect?: (data: string | null) => void
  hoje?: string // YYYY-MM-DD; dias depois dele ficam apagados
}) {
  const [hover, setHover] = useState<DiaTotal | null>(null)
  const max = Math.max(...dias.map(d => d.total), 1)
  const vazios = firstWeekday(mes)
  const foco = hover ?? dias.find(d => d.data === selected) ?? null
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Gastos por dia do mês">
        {SEMANA.map((s, i) => <div key={i} className="text-center text-[10px] font-semibold text-muted pb-1">{s}</div>)}
        {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}
        {dias.map(d => {
          const futuro = !!hoje && d.data > hoje
          const intensidade = d.total > 0 ? 12 + Math.sqrt(d.total / max) * 78 : 0
          const sel = selected === d.data
          return (
            <button key={d.data} type="button" disabled={futuro}
              onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d)} onBlur={() => setHover(null)}
              onClick={() => onSelect?.(sel ? null : d.data)} aria-pressed={sel}
              aria-label={`Dia ${d.dia}: ${brl(d.total)} em ${d.qtd} lançamento${d.qtd !== 1 ? 's' : ''}`}
              className="aspect-square rounded-lg text-[11px] num flex items-start justify-start p-1 transition-transform hover:scale-110 disabled:opacity-30 disabled:hover:scale-100"
              style={{
                background: d.total > 0 ? `color-mix(in srgb, ${color} ${intensidade}%, var(--surface-2))` : 'var(--surface-2)',
                color: intensidade > 55 ? '#fff' : 'var(--muted)',
                outline: sel ? `2px solid var(--ink)` : d.data === hoje ? `1px solid var(--brand)` : undefined,
                outlineOffset: 1,
              }}>
              {d.dia}
            </button>
          )
        })}
      </div>
      <div className="mt-3 min-h-[44px] rounded-xl bg-surface-2 px-3 py-2 text-xs" aria-live="polite">
        {foco ? (
          <>
            <p className="font-medium text-ink first-letter:uppercase">{fmt(foco.data)}</p>
            <p className="text-muted mt-0.5">
              <span className="num font-semibold text-ink">{brl(foco.total)}</span>
              {' · '}{foco.qtd} lançamento{foco.qtd !== 1 ? 's' : ''}
              {foco.maior && <> · maior: {foco.maior.descricao.slice(0, 28)} (<span className="num">{brl(foco.maior.valor)}</span>)</>}
            </p>
          </>
        ) : (
          <p className="text-muted pt-1.5">Toque ou passe o mouse sobre um dia para ver os gastos.</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted justify-end">
        menos
        {[12, 35, 60, 90].map(i => <span key={i} className="w-3 h-3 rounded" style={{ background: `color-mix(in srgb, ${color} ${i}%, var(--surface-2))` }} />)}
        mais
      </div>
    </div>
  )
}
