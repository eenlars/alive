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
 */
export function FlowgladProviderWrapper({ children }: FlowgladProviderWrapperProps) {
  // Only load billing if user has a session cookie
  const hasSession = hasCookie(COOKIE_NAMES.SESSION)

  // Don't render FlowgladProvider for unauthenticated users
  if (!hasSession) {
    return <>{children}</>
  }

  return (
    <LoadedFlowgladProvider loadBilling={true} serverRoute="/api/flowglad">
      {children}
    </LoadedFlowgladProvider>
  )
}
