import type { ReactNode } from 'react'

const TONES = {
  neutral: { bg: 'var(--surface-2)', fg: 'var(--muted)' },
  brand:   { bg: 'var(--brand-soft)', fg: 'var(--brand)' },
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  danger:  { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
} as const

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  const t = TONES[tone]
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  )
}
