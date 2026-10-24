import * as React from 'react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

function AmountInput({
  id,
  caption,
  className,
  inputClassName,
  ...props
}: React.ComponentProps<typeof Input> & {
  caption: React.ReactNode
  inputClassName?: string
}) {
  return (
    <div className={cn('border-b border-border pb-3 text-center', className)}>
      <label htmlFor={id} className="block text-sm text-muted-foreground">
        {caption}
      </label>
      <div className="mx-auto inline-flex max-w-full items-center justify-center">
        <span aria-hidden="true" className="text-4xl font-bold tabular-nums text-focal">฿</span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          className={cn(
            'h-auto w-[8ch] min-w-0 border-0 bg-transparent px-1 py-0 text-left text-4xl font-bold leading-[1.35] tabular-nums text-focal shadow-none focus-visible:ring-0 md:text-4xl dark:bg-transparent',
            inputClassName,
          )}
          {...props}
        />
      </div>
    </div>
  )
}

export { AmountInput }
