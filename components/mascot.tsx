import { cn } from '@/lib/utils'

export type MascotExpr =
  | 'deadpan'
  | 'smug'
  | 'sleepy'
  | 'surprised'
  | 'shrug'
  | 'thinking'

/**
 * The JodSa mascot — a deadpan onigiri-silhouette character. Monochrome SVG
 * (black line + white body) served from /public/mascot. Decorative by default
 * (aria-hidden); pass `alt` to make it meaningful to screen readers.
 *
 * Brand rule: the mascot never celebrates a spend — its unimpressed stare is the
 * "anti-confetti" that keeps the app rewarding saving, not spending.
 */
export function Mascot({
  expr = 'deadpan',
  className,
  alt,
}: {
  expr?: MascotExpr
  className?: string
  alt?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed
    <img
      src={`/mascot/mascot-${expr}.svg`}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      // `dark:invert` is load-bearing, not decoration: the SVGs hardcode a
      // #141414 stroke on a #ffffff body, so on the dark theme's ~#0a0d12
      // surfaces the linework disappears and the mascot reads as a smudge
      // (caught rendering the design v4 F4 empty state). Inverting flips it to
      // light lines on a dark body, which stays monochrome and on-brand.
      // Applies to every usage, so the pre-existing dark-theme mascots on
      // /transactions, the recurring form and budget-bar are fixed too.
      className={cn('select-none dark:invert', className)}
    />
  )
}
