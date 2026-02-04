/**
 * Supabase List Tables Tool
 *
 * List all tables in the connected Supabase project's database.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { errorResult, successResult, type ToolResult } from "../../lib/api-client.js"
import { executeQuery, getSupabaseContext, isToolError } from "./supabase-client.js"

export const listTablesParamsSchema = {
  schema: z.string().optional().describe("Database schema to list tables from. Default: 'public'"),
}

export interface ListTablesParams {
  schema?: string
}

/**
 * List all tables in the connected Supabase project.
 */
export async function listTables(params: ListTablesParams): Promise<ToolResult> {
  const schema = params.schema || "public"

  // Get Supabase context
  const context = await getSupabaseContext()
  if (isToolError(context)) {
    return context
  }

  // Query information_schema for tables
  const query = `
    SELECT
      table_name,
      table_type,
      (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count
    FROM information_schema.tables t
    WHERE table_schema = '${schema}'
    ORDER BY table_name
  `

  const result = await executeQuery(context.accessToken, context.projectRef, query, true)

  if (result.error) {
    return errorResult("Failed to list tables", result.error)
  }

  const tables = (result.data || []) as Array<{
    table_name: string
    table_type: string
    column_count: number
  }>

  if (tables.length === 0) {
    return successResult(`No tables found in schema '${schema}'.`)
  }

  // Format output
  const lines = tables.map(t => {
    const typeLabel = t.table_type === "BASE TABLE" ? "table" : t.table_type.toLowerCase()
    return `- ${t.table_name} (${typeLabel}, ${t.column_count} columns)`
  })

  return successResult(`Tables in '${schema}' schema (${tables.length}):\n\n${lines.join("\n")}`)
}

export const listTablesTool = tool(
  "list_tables",
  `List all tables in the connected Supabase project database.

Returns table names, types (table/view), and column counts.

Parameters:
- schema: Database schema (default: 'public')

Use this to explore the database structure before running queries.`,
  listTablesParamsSchema,
  async args => {
    return listTables(args as ListTablesParams)
  },
)
