import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // .skel already runs the Bevel shimmer sweep (globals.css) — stacking
      // Tailwind's animate-pulse on top double-animates and muddies the effect.
      className={cn("skel rounded-sm", className)}
      {...props}
    />
  )
}

export { Skeleton }
