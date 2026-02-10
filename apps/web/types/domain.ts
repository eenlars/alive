/**
 * Shared domain configuration types
 * Used by both client and server for type safety
 */

/**
 * Domain info for client/manager UI
 * Populated from Supabase
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
