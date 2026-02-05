"use client"

import { createContext, useContext, type ReactNode } from "react"

export interface DomainConfig {
  wildcard: string
  main: string
  previewBase: string
}

const DomainConfigContext = createContext<DomainConfig | null>(null)

/**
 * Provides server-resolved domain config to client components.
 * Values come from server-config.json via @webalive/shared (read at runtime, not build time).
 */
export function DomainConfigProvider({ config, children }: { config: DomainConfig; children: ReactNode }) {
  return <DomainConfigContext.Provider value={config}>{children}</DomainConfigContext.Provider>
}

/**
 * Read domain config in client components. Throws if used outside provider.
 */
export function useDomainConfig(): DomainConfig {
  const config = useContext(DomainConfigContext)
  if (!config) {
    throw new Error("[useDomainConfig] Must be used within DomainConfigProvider")
  }
  return config
}
