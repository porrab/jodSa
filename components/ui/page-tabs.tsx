'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

function PageTabs({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="tablist"
      className={cn('grid gap-1 rounded-xl bg-muted p-1', className)}
      {...props}
    />
  )
}

function PageTab({ active, className, ...props }: React.ComponentProps<'button'> & { active: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'min-h-10 rounded-lg px-3 text-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey-edge',
        active && 'bg-card font-semibold text-foreground shadow-soft',
        className,
      )}
      {...props}
    />
  )
}

export { PageTabs, PageTab }
