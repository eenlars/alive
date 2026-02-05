"use client"

import { FlowgladProvider } from "@flowglad/nextjs"
import { COOKIE_NAMES } from "@webalive/shared"
import type { ReactNode } from "react"

interface FlowgladProviderWrapperProps {
  children: ReactNode
}

/** Check if a cookie exists (client-side) */
function hasCookie(name: string): boolean {
  if (typeof document === "undefined") return false
  return document.cookie.split(";").some(c => c.trim().startsWith(`${name}=`))
}

/**
 * FlowGlad provider wrapper for billing functionality.
 *
 * Only loads billing when the user has a session cookie. This avoids
 * unnecessary API calls and errors for unauthenticated users.
 */
export function FlowgladProviderWrapper({ children }: FlowgladProviderWrapperProps) {
  // Only load billing if user has a session cookie
  const hasSession = hasCookie(COOKIE_NAMES.SESSION)

  return (
    <FlowgladProvider loadBilling={hasSession} serverRoute="/api/flowglad">
      {children}
    </FlowgladProvider>
  )
}
