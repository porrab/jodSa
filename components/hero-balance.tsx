'use client'

import { useEffect, useState } from 'react'
import { formatTHB } from '@/lib/money'

/**
 * The hero total-balance figure with a count-up on mount — the "balance update"
 * micro-interaction the design brief calls for. SSR renders the real value (so
 * no-JS / hydration is correct); on mount it animates 0 → value with an ease-out
 * curve. Honors prefers-reduced-motion by skipping straight to the final value.
 */
export function HeroBalance({ satang, className }: { satang: number; className?: string }) {
  const [shown, setShown] = useState(satang)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setShown(satang)
      return
    }
    const duration = 700
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(satang * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    setShown(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [satang])

  return <span className={className}>{formatTHB(shown)}</span>
}
