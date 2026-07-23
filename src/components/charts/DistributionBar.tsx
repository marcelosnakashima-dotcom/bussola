interface ClassInfo { classificacao: string; total: number; pct: number; meta: number }

export function DistributionBar({ classes, renda }: { classes: ClassInfo[]; renda: number }) {
  const colors = { necessidade: '#2A6049', desejo: '#D97706', poupanca: '#2563EB' }

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden gap-px" style={{ background: 'var(--border)' }}>
        {classes.map(cl => (
          <div
            key={cl.classificacao}
            style={{
              width: `${Math.min(cl.pct * 100, 100)}%`,
              background: colors[cl.classificacao as keyof typeof colors],
              transition: 'width 0.4s ease',
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
        <span>meta 50%</span>
        <span>80%</span>
      </div>
    </div>
  )
}
