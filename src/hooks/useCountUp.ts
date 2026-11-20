import { useEffect, useRef, useState } from 'react'

// Anima um número até o valor final (respeita "reduzir movimento" do sistema).
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const reduz = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduz || !Number.isFinite(target)) { setValue(target); from.current = target; return }
    const start = performance.now()
    const inicial = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(inicial + (target - inicial) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}
