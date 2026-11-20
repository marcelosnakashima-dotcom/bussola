import type { ReactNode } from 'react'

type Variant = 'glass' | 'solid' | 'hero'

// Superfície das telas novas. Padrão: vidro translúcido sobre o fundo aurora.
export function Card({ children, className = '', padded = true, variant = 'glass' }: {
  children: ReactNode
  className?: string
  padded?: boolean
  variant?: Variant
}) {
  const base = variant === 'hero' ? 'hero' : variant === 'glass' ? 'glass' : 'border border-line bg-surface'
  return (
    <section className={`rounded-3xl ${base} ${padded ? 'p-5 md:p-6' : ''} ${className}`}
      style={variant === 'solid' ? { boxShadow: 'var(--shadow-sm)' } : undefined}>
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
