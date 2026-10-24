import * as React from 'react'

import { cn } from '@/lib/utils'

function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-[1.35]">{title}</h1>
        {action}
      </div>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </header>
  )
}

export { PageHeader }
