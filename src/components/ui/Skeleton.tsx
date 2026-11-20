export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg animate-pulse bg-line/70 ${className}`} aria-hidden="true" />
}
