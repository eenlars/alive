/**
 * Supabase Run Query Tool
 *
 * Execute arbitrary SQL queries on the connected Supabase project.
 * Supports SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, etc.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { errorResult, successResult, type ToolResult } from "../../lib/bridge-api-client.js"
import { executeQuery, getSupabaseContext, isToolError } from "./supabase-client.js"

export const runQueryParamsSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      "The SQL query to execute. Supports all SQL operations: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE, etc.",
    ),
  read_only: z
    .boolean()
    .optional()
    .describe(
      "If true, only SELECT queries are allowed (safer for exploration). Default: false (allows all operations).",
    ),
}

export interface RunQueryParams {
  query: string
  read_only?: boolean
}

/**
 * Execute a SQL query on the connected Supabase project.
 *
 * Examples:
 * - SELECT * FROM users LIMIT 10
 * - CREATE TABLE posts (id serial primary key, title text, created_at timestamptz default now())
 * - INSERT INTO posts (title) VALUES ('Hello World')
 * - ALTER TABLE posts ADD COLUMN content text
 */
export async function runQuery(params: RunQueryParams): Promise<ToolResult> {
  const { query, read_only = false } = params

  // Validate query
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return errorResult("Invalid query", "Query must be a non-empty string.")
  }

  // Get Supabase context (token + project ref)
  const context = await getSupabaseContext()
  if (isToolError(context)) {
    return context
  }

  // Execute the query
  const result = await executeQuery(context.accessToken, context.projectRef, query.trim(), read_only)

  if (result.error) {
    return errorResult("Query failed", result.error)
  }

  // Format results
  const data = result.data || []

  if (data.length === 0) {
    // Could be a successful DDL statement (CREATE TABLE returns empty)
    const upperQuery = query.trim().toUpperCase()
    if (
      upperQuery.startsWith("CREATE") ||
      upperQuery.startsWith("ALTER") ||
      upperQuery.startsWith("DROP") ||
      upperQuery.startsWith("INSERT") ||
      upperQuery.startsWith("UPDATE") ||
      upperQuery.startsWith("DELETE")
    ) {
      return successResult("Query executed successfully (no rows returned).")
    }
    return successResult("Query returned 0 rows.")
  }

  // Format as table-like output
  const formattedRows = data.map((row, i) => `Row ${i + 1}: ${JSON.stringify(row, null, 2)}`).join("\n\n")

  return successResult(`Query returned ${data.length} row(s):\n\n${formattedRows}`)
}

export const runQueryTool = tool(
  "run_query",
  `Execute SQL queries on the connected Supabase project database.

Supports ALL SQL operations:
- Queries: SELECT, WITH (CTEs)
- Data modification: INSERT, UPDATE, DELETE
- Schema changes: CREATE TABLE, ALTER TABLE, DROP TABLE
- Indexes: CREATE INDEX, DROP INDEX
- Other: CREATE FUNCTION, CREATE TRIGGER, etc.

Use read_only=true to restrict to SELECT-only queries for safer exploration.

Examples:
- "SELECT * FROM users LIMIT 10"
- "CREATE TABLE posts (id serial primary key, title text not null)"
- "ALTER TABLE posts ADD COLUMN author_id int references users(id)"`,
  runQueryParamsSchema,
  async args => {
    return runQuery(args as RunQueryParams)
  },
)
