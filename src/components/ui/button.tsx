import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * RMIS button system. Every control is a capsule — the spec's 128px button
 * radius. The primary control is the RMIS Electric Blue pill (legacy RMIS
 * #1591DC fill, white ink, hover darkens to #0E7ABF), weight 500, soft float
 * shadow on hover. No square corners, no gradients.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring aria-invalid:ring-destructive/20 aria-invalid:border-destructive select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(31,32,37,0.12)] hover:bg-primary-hover hover:-translate-y-px hover:shadow-[rgba(0,0,0,0.15)_0px_2px_16px_0px] active:translate-y-0.5 active:bg-primary",
        destructive:
          "bg-destructive text-white shadow-[0_1px_2px_rgba(31,32,37,0.12)] hover:bg-destructive/90 hover:-translate-y-px active:translate-y-0.5",
        outline:
          "border border-[#dfe6f0] bg-background text-foreground shadow-[0_1px_2px_rgba(31,32,37,0.04)] hover:bg-secondary hover:shadow-[0_2px_8px_rgba(31,32,37,0.07)]",
        secondary:
          "bg-accent text-accent-foreground hover:bg-[#e1e8f3]",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline-offset-4 hover:underline rounded-sm",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-8 gap-1.5 px-3.5 text-[13px] has-[>svg]:px-3",
        lg: "h-11 px-6 has-[>svg]:px-5",
        xl: "h-12 px-7 text-[15px] has-[>svg]:px-6",
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7",
        "icon-lg": "size-11",
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
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
