/**
 * Available Integrations API
 *
 * Returns the list of integrations available to the current user based on:
 * - Global active status
 * - Visibility level (public, admin_only, etc.)
 * - Explicit access policies
 * - Grandfathering (existing connections)
 *
 * Connection status is checked against lockbox.user_secrets (oauth-core storage)
 */

import * as Sentry from "@sentry/nextjs"
import { getOAuthKeyForProvider } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"
import { createIntegrationsClient } from "@/lib/supabase/integrations"

export type TokenStatus = "valid" | "expired" | "needs_reauth" | "not_connected"

export interface AvailableIntegration {
  provider_key: string
  display_name: string
  logo_path: string | null
  is_connected: boolean
  visibility_status: string
  /** Token health status - helps UI show if reconnection is needed (optional for backwards compatibility) */
  token_status?: TokenStatus
  /** Human-readable status message */
  status_message?: string
}

/**
 * GET - Get available integrations for the current user
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user
    console.log("[Integrations API] Incoming request headers:", {
      hasCookie: !!req.headers.get("cookie"),
      host: req.headers.get("host"),
    })

    const user = await getSessionUser()
    console.log(
      "[Integrations API] getSessionUser result:",
      user ? `User ID: ${user.id}, Email: ${user.email}` : "null",
    )

    if (!user) {
      console.error("[Integrations API] No user found - returning UNAUTHORIZED")
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 2. Get Supabase client for integrations schema (service key for server-side access)
    const supabase = await createIntegrationsClient("service")

    // 3. Call the RPC function to get available integrations
    const { data: integrations, error } = await supabase.rpc("get_available_integrations", {
      p_user_id: user.id,
    })

    if (error) {
      console.error("[Integrations] Failed to fetch available integrations:", error)
      Sentry.captureException(error)
      return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
        reason: error.message,
      })
    }

    // 4. Transform and check actual connection status + token health from lockbox
    const availableIntegrations: AvailableIntegration[] = await Promise.all(
      (integrations || []).map(async (integration: any) => {
        // Check actual connection status and token health from oauth-core
        let isConnected = false
        let tokenStatus: TokenStatus = "not_connected"
        let statusMessage: string | undefined

        try {
          // Use oauthKey for OAuth operations (e.g., "gmail" -> "google")
          const oauthKey = getOAuthKeyForProvider(integration.provider_key)
          const oauthManager = getOAuthInstance(oauthKey)
          isConnected = await oauthManager.isConnected(user.id, oauthKey)

          if (isConnected) {
            // Token exists - now check if it's actually valid by trying to get it
            // This will trigger auto-refresh if expired
            try {
              await oauthManager.getAccessToken(user.id, oauthKey)
              tokenStatus = "valid"
            } catch (tokenError) {
              const errorMsg = tokenError instanceof Error ? tokenError.message : String(tokenError)

              if (errorMsg.includes("revoked") || errorMsg.includes("invalid_grant")) {
                tokenStatus = "needs_reauth"
                statusMessage = "Connection expired. Please reconnect."
              } else if (errorMsg.includes("expired") || errorMsg.includes("refresh")) {
                tokenStatus = "needs_reauth"
                statusMessage = "Token refresh failed. Please reconnect."
              } else {
                tokenStatus = "needs_reauth"
                statusMessage = "Connection issue. Please reconnect."
              }
              console.warn(`[Integrations] ${integration.provider_key} token health check failed:`, errorMsg)
            }
          }
        } catch {
          // Provider not supported in oauth-core, use RPC result
          isConnected = integration.is_connected
          tokenStatus = isConnected ? "valid" : "not_connected" // Assume valid if we can't check
        }

        return {
          provider_key: integration.provider_key,
          display_name: integration.display_name,
          logo_path: integration.logo_path,
          is_connected: isConnected,
          visibility_status: integration.visibility_status,
          token_status: tokenStatus,
          status_message: statusMessage,
        }
      }),
    )

    console.log(
      "[Integrations API] Returning integrations:",
      availableIntegrations.map(i => ({
        key: i.provider_key,
        connected: i.is_connected,
        status: i.token_status,
      })),
    )

    return NextResponse.json(
      {
        integrations: availableIntegrations,
        user_id: user.id,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    )
  } catch (error) {
    console.error("[Integrations] Unexpected error:", error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      reason: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
