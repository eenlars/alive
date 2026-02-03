/**
 * TanStack Query DevTools setup
 * Only loaded in development for debugging
 */

"use client"

import { lazy, Suspense } from "react"

// Lazy load devtools only in development (never in production)
const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then(mod => ({
          default: mod.ReactQueryDevtools,
        })),
      )
    : null

export function QueryDevTools() {
  if (!ReactQueryDevtools) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <ReactQueryDevtools
        initialIsOpen={false}
        buttonPosition="bottom-right"
        // Only show in development
        {...(process.env.NODE_ENV === "development" && { initialIsOpen: false })}
      />
    </Suspense>
  )
}

export default QueryDevTools
