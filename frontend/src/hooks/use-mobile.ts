import * as React from "react"

/** Below this width the sidebar opens as a drawer. The app's `lg` breakpoint, not shadcn's 768 px. */
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < MOBILE_BREAKPOINT)

  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    query.addEventListener("change", onChange)
    return () => {
      query.removeEventListener("change", onChange)
    }
  }, [])

  return isMobile
}
