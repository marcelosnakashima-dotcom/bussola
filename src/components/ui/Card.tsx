import type { ReactNode } from 'react'

// Superfície padrão das telas novas: borda suave, cantos arredondados, sombra leve.
export function Card({ children, className = '', padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface ${padded ? 'p-5' : ''} ${className}`}
      style={{ boxShadow: 'var(--shadow-sm)' }}>
      {children}
    </section>
  )
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="text-xs mt-0.5 text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
