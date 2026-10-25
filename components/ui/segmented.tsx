import * as React from 'react'

import { cn } from '@/lib/utils'

function Segmented({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="segmented"
      className={cn('grid min-h-12 gap-1 rounded-md bg-muted p-1', className)}
      {...props}
    />
  )
}

function SegmentedItem({
  className,
  active = false,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-slot="segmented-item"
      data-state={active ? 'active' : 'inactive'}
      className={cn(
        'min-h-10 rounded-sm px-3 text-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey-edge',
        active && 'bg-card font-semibold text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Segmented, SegmentedItem }
