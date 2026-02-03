/**
 * Shared Bridge API Client for MCP Tools
 *
 * Provides a clean, DRY interface for tools to call back to the Bridge API.
 * Handles port resolution, error formatting, and response parsing.
 */

import { COOKIE_NAMES } from "@webalive/shared"
import { validateWorkspacePath } from "./workspace-validator.js"

/**
 * Get internal API base URL for localhost calls.
 *
 * ⚠️  INTERNAL USE ONLY - for MCP tool → Bridge API calls on same server.
 * DO NOT use for external URLs (use domain from environments.ts instead).
 */
function getApiBaseUrl(): string {
  // PORT is set by systemd and inherited by child process
  const portEnv = process.env.PORT

  // Defensive validation: PORT must exist
  if (!portEnv) {
    throw new Error("Invalid PORT environment variable: must be an integer between 1 and 65535")
  }

  // Defensive validation: trim and parse
  const portStr = portEnv.trim()
  const port = Number.parseInt(portStr, 10)

  // Defensive validation: must be finite integer in valid range
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT environment variable: must be an integer between 1 and 65535")
  }

  // Defensive validation: ensure input is a pure integer string (not "3000.0" or "3000port")
  // parseInt is too lenient - it parses "3000.0" to 3000, "3000port" to 3000, etc.
  if (portStr !== String(port)) {
    throw new Error("Invalid PORT environment variable: must be an integer between 1 and 65535")
  }

  return `http://localhost:${port}`
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
  [key: string]: unknown
}

export interface ApiCallOptions {
  endpoint: string
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: Record<string, any>
  timeout?: number
}

/**
 * Call Bridge API and return formatted tool result
 * Automatically validates workspaceRoot if present in body
 */
export async function callBridgeApi(options: ApiCallOptions): Promise<ToolResult> {
  const { endpoint, method = "POST", body, timeout = 60000 } = options

  // Security: Auto-validate workspaceRoot if present (fail fast)
  if (body?.workspaceRoot) {
    try {
      validateWorkspacePath(body.workspaceRoot)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return errorResult("Invalid workspace path", errorMessage)
    }
  }

  try {
    const apiUrl = `${getApiBaseUrl()}${endpoint}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Include session cookie from environment (set by Bridge)
    const sessionCookie = process.env.BRIDGE_SESSION_COOKIE

    // Include internal tools secret for privileged API calls
    const internalSecret = process.env.INTERNAL_TOOLS_SECRET
    const isInternalToolsApi = endpoint.startsWith("/api/internal-tools/")

    const response = await fetch(apiUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(sessionCookie && { Cookie: `${COOKIE_NAMES.SESSION}=${sessionCookie}` }),
        ...(isInternalToolsApi && internalSecret && { "X-Internal-Tools-Secret": internalSecret }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.message || errorMessage
      } catch {
        // Response wasn't JSON, use status text
      }

      return {
        content: [{ type: "text", text: `✗ API call failed\n\n${errorMessage}` }],
        isError: true,
      }
    }

    const result = (await response.json()) as any

    if (result.success || result.ok) {
      return {
        content: [
          {
            type: "text",
            text: result.message || result.output || "✓ Operation completed successfully",
          },
        ],
        isError: false,
      }
    }

    return {
      content: [{ type: "text", text: `✗ ${result.message || "Unknown error"}` }],
      isError: true,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes("aborted")) {
      return {
        content: [{ type: "text", text: `✗ Request timed out after ${timeout / 1000}s` }],
        isError: true,
      }
    }

    return {
      content: [{ type: "text", text: `✗ Failed to reach Bridge API\n\nError: ${errorMessage}` }],
      isError: true,
    }
  }
}

/**
 * Helper to create success result
 */
export function successResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `✓ ${message}` }],
    isError: false,
  }
}

/**
 * Helper to create error result
 */
export function errorResult(message: string, details?: string): ToolResult {
  return {
    content: [{ type: "text", text: details ? `✗ ${message}\n\n${details}` : `✗ ${message}` }],
    isError: true,
  }
}
