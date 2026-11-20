import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, children, action }: {
  icon: LucideIcon
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-brand-soft">
        <Icon className="w-6 h-6 text-brand" />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="text-sm mt-1 max-w-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
