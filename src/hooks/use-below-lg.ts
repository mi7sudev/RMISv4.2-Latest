import * as React from "react"

// RMIS — media-query hook matching the app shell's own mobile boundary:
// Tailwind's `lg` (1024px). The shell renders its mobile chrome (top brand
// bar, bottom ExpandableTabs, PullToRefresh scroller) strictly below lg, so
// JS-side behavior must key on the SAME breakpoint useIsMobile() keys the
// shadcn `md` boundary on — same pattern, different constant.
const BELOW_LG_BREAKPOINT = 1024

export function useIsBelowLg() {
  const [isBelowLg, setIsBelowLg] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BELOW_LG_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsBelowLg(window.innerWidth < BELOW_LG_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsBelowLg(window.innerWidth < BELOW_LG_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isBelowLg
}
