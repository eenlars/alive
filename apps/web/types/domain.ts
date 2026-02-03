/**
 * Shared domain configuration types
 * Used by both client and server for type safety
 */

/**
 * Port registry entry - maps domain to port assignment
 * Legacy fields (passwordHash, tenantId, email, credits) removed 2024-12-01
 * All user/auth data now in Supabase
 */
export interface DomainConfig {
  port: number
  createdAt?: string
}

/**
 * Domain info for client/manager UI
 * Populated from Supabase, not from port registry
 */
export interface DomainConfigClient {
  port?: number
  orphaned?: boolean
  createdAt?: string
  email?: string
  orgId?: string
  credits: number
}

export interface DomainStatus {
  domain: string
  portListening: boolean
  httpAccessible: boolean
  httpsAccessible: boolean
  systemdServiceExists: boolean
  systemdServiceRunning: boolean
  caddyConfigured: boolean
  siteDirectoryExists: boolean
  dnsPointsToServer: boolean
  dnsResolvedIp: string | null
  dnsIsProxied?: boolean
  dnsVerificationMethod?: string
  vitePortMismatch: boolean
  viteExpectedPort: number
  viteActualPort: number | null
  hasSystemdPortOverride: boolean
  serveMode: "dev" | "build" | "unknown"
  createdAt: string | null
  lastChecked: number
}

export interface ViteConfigInfo {
  domain: string
  expectedPort: number
  actualPort: number | null
  portMismatch: boolean
  configPath: string | null
  allowedHosts: string[] | null
  hasSystemdOverride: boolean
  systemdOverridePort: number | null
  error?: string
}

export type DomainPasswords = Record<string, DomainConfig>
