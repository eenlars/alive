"use client"

import { useEffect, useState } from "react"

/**
 * Hook that returns whether a media query matches.
 * Returns `null` during SSR/initial render, then the actual value.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)

    // Set initial value
    setMatches(mql.matches)

    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

/**
 * Returns true if viewport is >= 640px (sm breakpoint).
 * Returns `null` during SSR/initial render.
 */
export function useIsDesktop(): boolean | null {
  return useMediaQuery("(min-width: 640px)")
}

/**
 * Returns true if viewport is < 640px (below sm breakpoint).
 * Returns `null` during SSR/initial render.
 */
export function useIsMobile(): boolean | null {
  return useMediaQuery("(max-width: 639px)")
}
