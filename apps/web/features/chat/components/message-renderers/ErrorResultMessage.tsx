import { ExternalLink, RotateCcw, WifiOff } from "lucide-react"
import { useCallback } from "react"
import { useRetry } from "@/features/chat/lib/retry-context"
import { useDexieMessageStore } from "@/lib/db/dexieMessageStore"
import { toUIMessage } from "@/lib/db/messageAdapters"
import { getMessageDb } from "@/lib/db/messageDb"
import type { StructuredError } from "@/lib/error-codes"
import { ErrorCodes, getErrorHelp, getErrorMessage, isWorkspaceError } from "@/lib/error-codes"
import { useCurrentWorkspace } from "@/lib/stores/workspaceStore"

/**
 * Check if an error is a network/offline error
 */
function isNetworkError(errorMessage: string): boolean {
  const networkPatterns = [
    "Failed to fetch",
    "NetworkError",
    "TypeError: fetch",
    "Connection lost",
    "No response body",
    "closed connection",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "network",
    "offline",
  ]

  const lowerMessage = errorMessage.toLowerCase()
  return networkPatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()))
}

/**
 * Check if an error is retryable (network issues, server errors, timeouts)
 */
function isRetryableError(errorMessage: string): boolean {
  const retryablePatterns = [
    "Failed to fetch",
    "NetworkError",
    "TypeError: fetch",
    "Connection lost",
    "No response body",
    "closed connection",
    "timeout",
    "HTTP 500",
    "HTTP 502",
    "HTTP 503",
    "HTTP 504",
    "Server error",
    "Service temporarily unavailable",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "offline",
    "network",
  ]

  const lowerMessage = errorMessage.toLowerCase()
  return retryablePatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()))
}

interface ErrorResultMessageProps {
  content: {
    type: "result"
    is_error: true
    result: string
  }
}

/**
 * Try to extract a human-readable message from various error formats:
 * - Raw JSON: {"type":"error","error":{"type":"authentication_error","message":"..."}}
 * - API Error prefix: "API Error: 401 {...json...}"
 * - Structured error: {"error":"CODE","message":"...","details":{}}
 */
function extractHumanMessage(raw: string): { message: string; isAuth: boolean } {
  // Try to find embedded JSON in strings like "API Error: 401 {...}"
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : raw

  try {
    const parsed = JSON.parse(jsonStr)

    // Anthropic API format: {"type":"error","error":{"type":"...","message":"..."}}
    if (parsed?.error?.message) {
      const isAuth = parsed.error.type === "authentication_error"
      return { message: parsed.error.message, isAuth }
    }

    // Our structured format: {"error":"CODE","message":"..."}
    if (parsed?.message) {
      const isAuth = parsed.error === "API_AUTH_FAILED"
      return { message: parsed.message, isAuth }
    }

    // Details might have message
    if (parsed?.details?.message) {
      return { message: parsed.details.message, isAuth: false }
    }
  } catch {
    // Not JSON, continue
  }

  // Check for common patterns in the raw string
  if (raw.includes("OAuth token has expired")) {
    return { message: "The Claude OAuth token has expired. Please reconnect.", isAuth: true }
  }
  if (raw.includes("authentication_error")) {
    return { message: "Authentication failed. Please reconnect.", isAuth: true }
  }

  // Return cleaned raw message (strip "API Error: 401" prefix)
  const cleaned = raw.replace(/^API Error:\s*\d+\s*/i, "").trim()
  return { message: cleaned, isAuth: false }
}

export function ErrorResultMessage({ content }: ErrorResultMessageProps) {
  const { retryLastMessage } = useRetry()
  const errorMessage = content.result
  const canRetry = isRetryableError(errorMessage)
  const isOffline = isNetworkError(errorMessage)
  const workspace = useCurrentWorkspace()

  // Extract human-readable message from potentially ugly JSON
  const { message: extractedMessage, isAuth: isAuthFromExtract } = extractHumanMessage(errorMessage)

  let parsedError: StructuredError | null = null
  try {
    parsedError = JSON.parse(errorMessage)
  } catch {
    // Not structured error, use raw message
  }

  const errorCode = parsedError?.error
  const isWorkspace = errorCode ? isWorkspaceError(errorCode) : false
  const isAuthError = errorCode === "API_AUTH_FAILED" || isAuthFromExtract
  const isSessionCorrupt = errorCode === ErrorCodes.SESSION_CORRUPT

  // Continue in new tab: copy messages from current tab to a new tab
  const handleContinueInNewTab = useCallback(async () => {
    if (!workspace) return

    const dexieState = useDexieMessageStore.getState()
    const userId = dexieState.session?.userId
    const currentTabId = dexieState.currentTabId
    if (!userId || !currentTabId) return

    // Dynamically import tab store to avoid circular deps
    const { useTabActions: getTabActions } = await import("@/lib/stores/tabStore")
    const { useTabDataStore: tabDataStoreHook } = await import("@/lib/stores/tabDataStore")

    const tabActions = getTabActions()
    const tabDataStore = tabDataStoreHook.getState()

    // Find the current tab's group
    const workspaceTabs = tabDataStore.tabsByWorkspace[workspace]
    if (!workspaceTabs) return
    const currentTab = Object.values(workspaceTabs)
      .flat()
      .find(t => t.id === currentTabId)
    if (!currentTab) return

    // Create new tab in the same group
    const newTab = tabActions.addTab(workspace, currentTab.tabGroupId, "Continued conversation")
    if (!newTab) return

    // Copy messages from old tab to new tab
    try {
      const db = getMessageDb(userId)
      const oldMessages = await db.messages.where("tabId").equals(currentTabId).sortBy("seq")

      // Filter out the error message itself
      const messagesToCopy = oldMessages.filter(m => m.status !== "error")

      // Write messages to the new tab with fresh IDs and updated tabId
      const now = Date.now()
      await db.messages.bulkPut(
        messagesToCopy.map((m, i) => ({
          ...m,
          id: `${newTab.id}-migrated-${i}`,
          tabId: newTab.id,
          seq: i + 1,
          createdAt: m.createdAt,
          updatedAt: now,
        })),
      )

      // Build a summary of the conversation for the new tab's first message context
      const uiMessages = messagesToCopy.map(toUIMessage)
      const lastAssistantMsg = [...uiMessages].reverse().find(m => m.type === "sdk_message")
      if (lastAssistantMsg) {
        // Add a system note so the user knows this is continued
        const noteMessage = {
          id: `${newTab.id}-continued-note`,
          tabId: newTab.id,
          type: "system" as const,
          content: { kind: "text" as const, text: "Conversation continued from a previous session." },
          createdAt: now,
          updatedAt: now,
          version: 1,
          status: "complete" as const,
          origin: "local" as const,
          seq: messagesToCopy.length + 1,
        }
        await db.messages.put(noteMessage)
      }
    } catch (e) {
      console.error("[ErrorResultMessage] Failed to copy messages:", e)
    }

    // Switch to the new tab
    tabActions.setActiveTab(workspace, newTab.id)
  }, [workspace])

  // Get friendly message based on error code
  const getFriendlyMessage = (): string => {
    // If we extracted a clean message, use it
    if (extractedMessage && !extractedMessage.includes("{") && extractedMessage !== errorMessage) {
      return extractedMessage
    }

    // For auth errors, show the actual Anthropic error message (cleaned)
    if (isAuthError && parsedError?.details) {
      if (typeof parsedError.details === "object" && "message" in parsedError.details) {
        return String(parsedError.details.message)
      }
      if (typeof parsedError.details === "string") {
        return parsedError.details
      }
    }

    if (errorCode && parsedError?.details) {
      return getErrorMessage(errorCode, parsedError.details)
    }
    if (parsedError?.message) {
      return parsedError.message
    }

    // Better fallback messages for common HTTP errors
    if (errorMessage.includes("HTTP 401")) {
      return "Your session has expired. Please refresh the page and log in again."
    }
    if (errorMessage.includes("HTTP 403")) {
      return "Access denied. Please check your permissions."
    }
    if (errorMessage.includes("HTTP 500")) {
      return "Server error. Please try again in a moment."
    }
    if (errorMessage.includes("HTTP 503")) {
      return "Service temporarily unavailable. Please try again in a moment."
    }
    if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
      return "Couldn't reach the server. Please check your internet connection."
    }
    if (errorMessage.includes("Connection lost")) {
      return "Connection lost. Please check your internet connection and try again."
    }
    if (errorMessage.includes("No response body")) {
      return "Server did not respond. Please try again."
    }
    if (errorMessage.includes("closed connection without sending")) {
      return "Server closed the connection unexpectedly. Please try again."
    }

    // Never show raw JSON to users - if the message contains JSON, show generic error
    if (errorMessage.includes("{") && errorMessage.includes("}")) {
      if (errorMessage.includes("OAuth") || errorMessage.includes("token has expired")) {
        return "The Claude OAuth token has expired. Please reconnect."
      }
      if (isAuthError || errorMessage.includes("auth") || errorMessage.includes("token")) {
        return "Authentication failed. Please reconnect."
      }
      return "Something went wrong. Please try again."
    }

    // Fallback for unparseable errors
    return errorMessage
  }

  const getHelpText = () => {
    if (errorCode && parsedError?.details) {
      return getErrorHelp(errorCode, parsedError.details)
    }

    // Specific help for authentication errors
    if (isAuthError) {
      return null // Main message already explains the issue
    }

    // Helpful context for common errors
    if (errorMessage.includes("HTTP 401") || errorMessage.includes("session has expired")) {
      return "You may need to refresh the page to restore your session."
    }
    if (errorMessage.includes("Connection lost") || errorMessage.includes("closed connection")) {
      return "This can happen due to network issues or server maintenance. Your previous messages are safe."
    }

    return null
  }

  const details = parsedError?.details ?? null
  const helpText = getHelpText()
  const friendlyMessage = getFriendlyMessage()

  // Use amber/yellow for network errors (recoverable), blue for session corrupt, red for other errors
  const colorClass = isOffline
    ? "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/30"
    : isSessionCorrupt
      ? "border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/30"
      : "border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/30"
  const textColor = isOffline
    ? "text-amber-700 dark:text-amber-300"
    : isSessionCorrupt
      ? "text-blue-700 dark:text-blue-300"
      : "text-red-700 dark:text-red-300"
  const titleColor = isOffline
    ? "text-amber-900 dark:text-amber-100"
    : isSessionCorrupt
      ? "text-blue-900 dark:text-blue-100"
      : "text-red-900 dark:text-red-100"
  const iconColor = isOffline
    ? "text-amber-500 dark:text-amber-400"
    : isSessionCorrupt
      ? "text-blue-500 dark:text-blue-400"
      : "text-red-500 dark:text-red-400"
  const buttonClass = isSessionCorrupt
    ? "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60"
    : isOffline
      ? "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60"
      : "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60"

  const getTitle = () => {
    if (isOffline) return "Connection Failed"
    if (isSessionCorrupt) return "Session Interrupted"
    if (isAuthError) return "Authentication Error"
    if (isWorkspace) return "Workspace Error"
    return "Error"
  }

  return (
    <div className="py-3 mb-4">
      <div className={`border ${colorClass} p-4 rounded`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {isOffline ? (
              <WifiOff className={`w-5 h-5 ${iconColor}`} />
            ) : (
              <svg className={`w-5 h-5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-medium ${titleColor} mb-1`}>{getTitle()}</h3>
            <p className={`text-sm ${textColor} leading-relaxed`}>{friendlyMessage}</p>

            {helpText && (
              <p
                className={`text-xs mt-2 leading-relaxed ${isOffline ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
              >
                {helpText}
              </p>
            )}

            {details && (details.expectedPath || details.fullPath) && (
              <div className="mt-3 p-2 bg-red-100/50 dark:bg-red-900/20 rounded text-xs font-mono text-red-800 dark:text-red-200">
                {details.expectedPath && (
                  <div>
                    <span className="font-semibold">Expected:</span> {details.expectedPath}
                  </div>
                )}
                {details.fullPath && (
                  <div>
                    <span className="font-semibold">Path:</span> {details.fullPath}
                  </div>
                )}
              </div>
            )}

            {errorCode && !isSessionCorrupt && (
              <div className="mt-2 text-xs text-red-500/70 dark:text-red-400/70 font-mono">Error code: {errorCode}</div>
            )}

            {typeof parsedError?.details === "object" &&
              parsedError.details &&
              "apiRequestId" in parsedError.details &&
              parsedError.details.apiRequestId && (
                <div className="mt-1 text-xs text-red-500/70 dark:text-red-400/70 font-mono">
                  Request ID: {String(parsedError.details.apiRequestId)}
                </div>
              )}

            {isSessionCorrupt && (
              <button
                type="button"
                onClick={handleContinueInNewTab}
                className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${buttonClass} rounded transition-colors`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Continue in new tab
              </button>
            )}

            {canRetry && !isSessionCorrupt && (
              <button
                type="button"
                onClick={retryLastMessage}
                className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${buttonClass} rounded transition-colors`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
