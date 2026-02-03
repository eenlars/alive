/**
 * OAuth Popup Constants
 *
 * Shared constants for popup-based OAuth flow.
 * Used by both the opener (use-integrations hook) and callback page.
 */

/** Message type for postMessage communication between popup and opener */
export const OAUTH_CALLBACK_MESSAGE_TYPE = "oauth_callback" as const

/** Popup window dimensions */
export const OAUTH_POPUP_WIDTH = 500
export const OAUTH_POPUP_HEIGHT = 700

/** How often to check if popup was closed manually (ms) */
export const OAUTH_POPUP_POLL_INTERVAL = 500

/** Delay before auto-closing popup after success/error (ms) */
export const OAUTH_POPUP_CLOSE_DELAY = 1500

/** localStorage key prefix for fallback when window.opener is lost during cross-origin OAuth redirect */
export const OAUTH_STORAGE_KEY = "oauth_callback_result"

/** OAuth callback message structure */
export interface OAuthCallbackMessage {
  type: typeof OAUTH_CALLBACK_MESSAGE_TYPE
  integration: string
  status: "success" | "error"
  message?: string
}

/** Type guard for OAuth callback messages */
export function isOAuthCallbackMessage(data: unknown): data is OAuthCallbackMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as OAuthCallbackMessage).type === OAUTH_CALLBACK_MESSAGE_TYPE
  )
}
