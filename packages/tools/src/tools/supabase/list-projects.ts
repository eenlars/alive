/**
 * Supabase List Projects Tool
 *
 * List all Supabase projects accessible to the connected user.
 * Useful for seeing available projects and getting project refs.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { errorResult, successResult, type ToolResult } from "../../lib/api-client.js"
import { fetchProjects, getSupabaseContext, isToolError } from "./supabase-client.js"

export const listProjectsParamsSchema = {}

export type ListProjectsParams = Record<string, never>

/**
 * List all Supabase projects the user has access to.
 *
 * Returns project name, ID (ref), region, and organization.
 */
export async function listProjects(_params: ListProjectsParams): Promise<ToolResult> {
  // Get Supabase context (just need token, project ref not required for listing)
  const context = await getSupabaseContext()

  // For list_projects, we only need the access token
  // Allow partial context (connected but no project selected yet)
  if (isToolError(context)) {
    // Check if it's specifically "no project configured" - that's OK for listing
    const errorText = context.content[0]?.text || ""
    if (errorText.includes("No Supabase project configured")) {
      // Need to fetch token directly since context fetch failed
      // This is a limitation - we need the token even without project ref
      return errorResult(
        "Cannot list projects",
        "Supabase is connected but context fetch requires project ref. This will be fixed in a future update.",
      )
    }
    return context
  }

  const accessToken = context.accessToken

  // Fetch projects
  const result = await fetchProjects(accessToken)

  if (result.error) {
    return errorResult("Failed to list projects", result.error)
  }

  const projects = result.data || []

  if (projects.length === 0) {
    return successResult("No Supabase projects found. Create a project at https://supabase.com/dashboard")
  }

  // Format output
  const lines = projects.map(
    (p, i) => `${i + 1}. ${p.name}\n   Ref: ${p.id}\n   Region: ${p.region}\n   Org: ${p.organization_id}`,
  )

  return successResult(`Found ${projects.length} Supabase project(s):\n\n${lines.join("\n\n")}`)
}

export const listProjectsTool = tool(
  "list_projects",
  `List all Supabase projects accessible to the connected user.

Returns project name, reference ID (needed for configuration), region, and organization.

Use this to:
- See which projects are available
- Get the project ref to configure the connection
- Verify you have access to the expected projects`,
  listProjectsParamsSchema,
  async args => {
    return listProjects(args as ListProjectsParams)
  },
)
