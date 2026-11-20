import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand mb-1">{eyebrow}</p>}
        <h1 className="font-display text-[28px] md:text-[34px] leading-tight text-ink">{title}</h1>
        {subtitle && <p className="text-sm mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  )
}
