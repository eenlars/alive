/**
 * Integration UI Component Registry
 *
 * Maps OAuth MCP providers to their UI components.
 * When a provider is connected, the corresponding component is shown in Settings.
 *
 * IMPORTANT: This is type-safe with the shared OAUTH_MCP_PROVIDERS registry.
 * If you add a new provider there, TypeScript will require you to add it here.
 */

import type { OAuthMcpProviderKey } from "@webalive/shared"
import type { ComponentType } from "react"

/**
 * Props that integration UI components receive
 */
export interface IntegrationUIProps {
  /** Whether to use compact mode (for modal/sidebar) */
  compact?: boolean
  /** Maximum number of items to show */
  limit?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Configuration for an integration's UI
 */
export interface IntegrationUIConfig {
  /** React component to render when this integration is connected */
  component: ComponentType<IntegrationUIProps>
  /** Section title shown above the component */
  title: string
  /** Number of items to show in compact mode (modal) */
  compactLimit?: number
  /** Number of items to show in full mode (page) */
  fullLimit?: number
}

/**
 * Registry mapping provider keys to their UI components
 *
 * IMPORTANT: This must include ALL providers from OAUTH_MCP_PROVIDERS.
 * If a provider has no UI component, set it to null.
 *
 * TypeScript will enforce that all providers are covered.
 */
export const INTEGRATION_UI_REGISTRY = {
  github: null, // GitHub operations via GitHub MCP tools - supports PAT tokens
  stripe: null, // No UI component yet - just shows connection status
  linear: null, // Issues viewable via Linear MCP tools, not settings panel
  gmail: null, // Email operations via Gmail MCP tools
  supabase: null, // Database operations via Supabase MCP tools (run_query, etc.)
} as const satisfies Record<OAuthMcpProviderKey, IntegrationUIConfig | null>

/**
 * Get the UI config for a provider
 */
export function getIntegrationUI(providerKey: OAuthMcpProviderKey): IntegrationUIConfig | null {
  return INTEGRATION_UI_REGISTRY[providerKey] ?? null
}

/**
 * Check if a provider has a UI component
 */
export function hasIntegrationUI(providerKey: string): providerKey is OAuthMcpProviderKey {
  return providerKey in INTEGRATION_UI_REGISTRY && INTEGRATION_UI_REGISTRY[providerKey as OAuthMcpProviderKey] !== null
}
