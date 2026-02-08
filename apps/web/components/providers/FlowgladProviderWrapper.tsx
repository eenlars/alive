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
 * Only renders the FlowgladProvider when the user has a session cookie.
 * This avoids unnecessary API calls and errors for unauthenticated users.
 *
 * In Playwright E2E tests (window.PLAYWRIGHT_TEST === true), the provider
 * is skipped entirely because:
 * 1. Test users don't have Flowglad customer records
 * 2. The provider's internal QueryClientProvider can conflict with the app's
 *    if @tanstack/react-query is duplicated across packages
 */
export function FlowgladProviderWrapper({ children }: FlowgladProviderWrapperProps) {
  // Only load billing if user has a session cookie
  const hasSession = hasCookie(COOKIE_NAMES.SESSION)

  // Skip FlowgladProvider in E2E tests - test users don't have billing records
  // and the provider's QueryClientProvider can conflict with the app's
  const isPlaywrightTest =
    typeof window !== "undefined" && "PLAYWRIGHT_TEST" in window && window.PLAYWRIGHT_TEST === true

  // Don't render FlowgladProvider for unauthenticated users or E2E tests
  if (!hasSession || isPlaywrightTest) {
    return <>{children}</>
  }

  return (
    <LoadedFlowgladProvider loadBilling={true} serverRoute="/api/flowglad">
      {children}
    </LoadedFlowgladProvider>
  )
}
