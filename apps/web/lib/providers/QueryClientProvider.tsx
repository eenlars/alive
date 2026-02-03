"use client"

import { QueryClientProvider as TanStackQueryClientProvider } from "@tanstack/react-query"
import type React from "react"
import { useMemo } from "react"
import { createQueryClient } from "@/lib/tanstack/config"
import QueryDevTools from "@/lib/tanstack/devtools"

/**
 * Wraps entire app with TanStack Query provider
 * Includes QueryClient config, error handling, and DevTools
 */
export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  // Create client once per app lifecycle (not per render)
  const queryClient = useMemo(() => createQueryClient(), [])

  return (
    <TanStackQueryClientProvider client={queryClient}>
      {children}
      {/* DevTools in dev mode, null in production */}
      <QueryDevTools />
    </TanStackQueryClientProvider>
  )
}
