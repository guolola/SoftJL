// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Use the desktop shell for both server HTML and the first hydration render.
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    mql.addEventListener('change', onChange)
    onChange()

    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
