import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

function Chip({
  className,
  children,
  pressed = false,
  ...props
}: React.ComponentProps<'button'> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-slot="chip"
      data-state={pressed ? 'on' : 'off'}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey-edge disabled:pointer-events-none disabled:opacity-50',
        pressed
          ? 'border-[1.5px] border-honey-edge bg-secondary font-semibold text-foreground'
          : 'border-border bg-card font-normal text-foreground hover:bg-secondary',
        className,
      )}
      {...props}
    >
      {pressed && <Check aria-hidden="true" className="size-3.5" />}
      {children}
    </button>
  )
}

export { Chip }
