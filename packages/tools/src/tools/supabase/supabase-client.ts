/**
 * Supabase Management API Client for MCP Tools
 *
 * Handles authentication, project ref resolution, and API calls.
 * OAuth tokens and project ref are fetched from the Bridge API.
 */

import { COOKIE_NAMES } from "@webalive/shared"
import { errorResult, type ToolResult } from "../../lib/bridge-api-client.js"

const SUPABASE_API_BASE = "https://api.supabase.com"

/**
 * Get internal API base URL for localhost calls
 */
function getApiBaseUrl(): string {
  const portEnv = process.env.PORT
  if (!portEnv) {
    throw new Error("PORT environment variable not set")
  }
  const port = Number.parseInt(portEnv.trim(), 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT environment variable")
  }
  return `http://localhost:${port}`
}

/**
 * Supabase connection context retrieved from Bridge
 */
export interface SupabaseContext {
  accessToken: string
  projectRef: string
}

/**
 * Get Supabase access token and project ref from Bridge API
 *
 * The Bridge stores:
 * - OAuth tokens in lockbox.user_secrets (via oauth-core)
 * - Project ref in org-level settings (user configures after OAuth)
 */
export async function getSupabaseContext(): Promise<SupabaseContext | ToolResult> {
  try {
    const apiUrl = `${getApiBaseUrl()}/api/integrations/supabase/context`
    const sessionCookie = process.env.BRIDGE_SESSION_COOKIE

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(sessionCookie && { Cookie: `${COOKIE_NAMES.SESSION}=${sessionCookie}` }),
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        return errorResult(
          "Not connected to Supabase",
          "Please connect your Supabase account first via Settings > Integrations.",
        )
      }
      if (response.status === 404) {
        return errorResult(
          "No Supabase project configured",
          "You've connected Supabase, but haven't selected a project yet. Go to Settings > Integrations > Supabase to select your project.",
        )
      }
      const errorText = await response.text()
      return errorResult("Failed to get Supabase context", `HTTP ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as { accessToken: string; projectRef: string }
    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResult("Failed to connect to Supabase", message)
  }
}

/**
 * Check if result is an error (ToolResult) vs valid context
 */
export function isToolError(result: SupabaseContext | ToolResult): result is ToolResult {
  return "isError" in result && result.isError === true
}

/**
 * Execute a SQL query via Supabase Management API
 */
export async function executeQuery(
  accessToken: string,
  projectRef: string,
  query: string,
  readOnly = false,
): Promise<{ data?: unknown[]; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_API_BASE}/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query,
        read_only: readOnly,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => response.text())
      const errorMsg = typeof errorData === "object" ? JSON.stringify(errorData, null, 2) : errorData
      return { error: `Query failed (${response.status}): ${errorMsg}` }
    }

    const data = await response.json()
    return { data: Array.isArray(data) ? data : [data] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `Request failed: ${message}` }
  }
}

/**
 * List all projects via Supabase Management API
 */
export async function fetchProjects(
  accessToken: string,
): Promise<{ data?: Array<{ id: string; name: string; region: string; organization_id: string }>; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_API_BASE}/v1/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: `Failed to list projects (${response.status}): ${errorText}` }
    }

    const data = (await response.json()) as Array<{ id: string; name: string; region: string; organization_id: string }>
    return { data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `Request failed: ${message}` }
  }
}

/**
 * Get project details via Supabase Management API
 */
export async function fetchProject(
  accessToken: string,
  projectRef: string,
): Promise<{ data?: { id: string; name: string; region: string; status: string }; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_API_BASE}/v1/projects/${projectRef}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: `Failed to get project (${response.status}): ${errorText}` }
    }

    const data = (await response.json()) as { id: string; name: string; region: string; status: string }
    return { data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `Request failed: ${message}` }
  }
}
