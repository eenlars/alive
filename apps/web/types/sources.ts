/**
 * Domain source comparison types
 * Used for multi-source domain data reconciliation in manager
 */

export interface SupabaseSource {
  exists: boolean
  port: number | null
  orgId: string | null
  email: string | null
}

export interface CaddySource {
  exists: boolean
  port: number | null
}

export interface JsonSource {
  exists: boolean
  port: number | null
}

export interface FilesystemSource {
  exists: boolean
  path: string | null
}

export interface DnsSource {
  resolves: boolean
  ips: string[]
  matchesServer: boolean
}

export interface SystemdSource {
  exists: boolean
  active: boolean
  serveMode: "dev" | "build" | "unknown"
}

export interface SourceData {
  domain: string
  supabase: SupabaseSource
  caddy: CaddySource
  json: JsonSource
  filesystem: FilesystemSource
  dns: DnsSource
  systemd: SystemdSource
}

export interface PortConsistency {
  status: "match" | "mismatch" | "none"
  color: string
}

export interface SourcesResponse {
  sources: SourceData[]
}
