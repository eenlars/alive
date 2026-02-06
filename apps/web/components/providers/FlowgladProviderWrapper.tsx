"use client"

import { FlowgladProvider } from "@flowglad/nextjs"
import { COOKIE_NAMES } from "@webalive/shared"
import type { ComponentType, ReactNode } from "react"

interface FlowgladProviderWrapperProps {
  children: ReactNode
}

// FlowgladProvider has a union prop type (loaded | devMode) that prevents
// TypeScript from accepting non-common props in JSX. Narrow to the loaded variant.
const LoadedFlowgladProvider = FlowgladProvider as ComponentType<{
  children: ReactNode
  loadBilling: boolean
  serverRoute?: string
}>

/** Check if a cookie exists (client-side) */
function hasCookie(name: string): boolean {
  if (typeof document === "undefined") return false
  return document.cookie.split(";").some(c => c.trim().startsWith(`${name}=`))
}

/**
 * FlowGlad provider wrapper for billing functionality.
 *
 * ALWAYS renders FlowgladProvider because it sets up its own internal
 * QueryClientProvider (from @flowglad/react's bundled react-query).
 * Without it, useBilling() crashes with "No QueryClient set".
 *
 * loadBilling is only enabled when the user has a session cookie,
 * avoiding unnecessary API calls for unauthenticated users.
 */
export function FlowgladProviderWrapper({ children }: FlowgladProviderWrapperProps) {
  const hasSession = hasCookie(COOKIE_NAMES.SESSION)

  return (
    <LoadedFlowgladProvider loadBilling={hasSession} serverRoute="/api/flowglad">
      {children}
    </LoadedFlowgladProvider>
  )
}
