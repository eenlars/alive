"use client"

import { FlowgladProvider } from "@flowglad/nextjs"
import type { ReactNode } from "react"

interface FlowgladProviderWrapperProps {
  children: ReactNode
}

/**
 * FlowGlad provider wrapper for billing functionality.
 *
 * The provider automatically fetches billing state from /api/flowglad/billing
 * when loadBilling is true. We always load billing since the API endpoint
 * handles authentication - if the user isn't logged in, the API returns null.
 */
export function FlowgladProviderWrapper({ children }: FlowgladProviderWrapperProps) {
  return (
    <FlowgladProvider loadBilling={true} serverRoute="/api/flowglad">
      {children}
    </FlowgladProvider>
  )
}
