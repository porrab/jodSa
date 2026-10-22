import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-base font-semibold whitespace-nowrap transition-[color,background-color,border-color,opacity,transform] outline-none focus-visible:ring-2 focus-visible:ring-honey-edge focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-2 border-honey-edge bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "border-[1.5px] border-destructive bg-card text-destructive hover:bg-blush focus-visible:ring-destructive/30",
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:bg-secondary",
        secondary:
          "border border-border bg-card text-foreground shadow-xs hover:bg-secondary",
        ghost:
          "text-honey-text hover:bg-secondary hover:text-honey-text",
        link: "h-auto rounded-none px-0 text-honey-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 has-[>svg]:px-4",
        xs: "h-9 gap-1 px-3 text-sm has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 gap-1.5 px-4 text-sm has-[>svg]:px-3",
        lg: "h-[52px] px-7 has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-9 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-10",
        "icon-lg": "size-[52px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
