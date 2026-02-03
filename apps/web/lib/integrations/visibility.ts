/**
 * Integration Visibility Helpers
 *
 * Functions to check if a user has access to specific integrations
 * based on the database-driven visibility rules.
 */

import type { AvailableIntegration } from "@/app/api/integrations/available/route"
import { createIntegrationsClient } from "@/lib/supabase/integrations"

/**
 * Check if a user has access to a specific integration
 *
 * @param userId - The user ID to check
 * @param providerKey - The provider key (e.g., 'linear', 'github')
 * @returns true if the user can access this integration
 */
export async function canUserAccessIntegration(userId: string, providerKey: string): Promise<boolean> {
  try {
    const supabase = await createIntegrationsClient("service")

    // Call the RPC function to get available integrations
    const { data: integrations, error } = await supabase.rpc("get_available_integrations", {
      p_user_id: userId,
    })

    if (error) {
      console.error(`[Integration Visibility] Failed to check access for ${providerKey}:`, error)
      return false
    }

    // Check if the provider appears in the user's available integrations
    const hasAccess =
      Array.isArray(integrations) &&
      integrations.some((integration: AvailableIntegration) => integration.provider_key === providerKey)

    if (!hasAccess) {
      console.log(`[Integration Visibility] User ${userId} does not have access to ${providerKey}`)
    }

    return hasAccess
  } catch (error) {
    console.error(`[Integration Visibility] Error checking access for ${providerKey}:`, error)
    return false
  }
}

/**
 * Get all available integrations for a user
 *
 * @param userId - The user ID
 * @returns Array of available integrations
 */
export async function getUserIntegrations(userId: string): Promise<AvailableIntegration[]> {
  try {
    const supabase = await createIntegrationsClient("service")

    const { data: integrations, error } = await supabase.rpc("get_available_integrations", {
      p_user_id: userId,
    })

    if (error) {
      console.error("[Integration Visibility] Failed to fetch user integrations:", error)
      return []
    }

    return Array.isArray(integrations)
      ? integrations.map((integration: any) => ({
          provider_key: integration.provider_key,
          display_name: integration.display_name,
          logo_path: integration.logo_path,
          is_connected: integration.is_connected,
          visibility_status: integration.visibility_status,
        }))
      : []
  } catch (error) {
    console.error("[Integration Visibility] Error fetching integrations:", error)
    return []
  }
}

/**
 * Check if an integration is connected for a user
 *
 * @param userId - The user ID
 * @param providerKey - The provider key
 * @returns true if the user has an active connection
 */
export async function isIntegrationConnected(userId: string, providerKey: string): Promise<boolean> {
  const integrations = await getUserIntegrations(userId)
  const integration = integrations.find(i => i.provider_key === providerKey)
  return integration?.is_connected || false
}

/**
 * Guard function for OAuth routes
 * Throws an error if the user doesn't have access
 *
 * @param userId - The user ID
 * @param providerKey - The provider key
 * @throws Error if user doesn't have access
 */
export async function requireIntegrationAccess(userId: string, providerKey: string): Promise<void> {
  const hasAccess = await canUserAccessIntegration(userId, providerKey)

  if (!hasAccess) {
    throw new Error(`Access denied: User does not have permission to use ${providerKey} integration`)
  }
}
