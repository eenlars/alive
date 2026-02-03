/**
 * Supabase Describe Table Tool
 *
 * Get detailed schema information for a specific table.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { errorResult, successResult, type ToolResult } from "../../lib/bridge-api-client.js"
import { executeQuery, getSupabaseContext, isToolError } from "./supabase-client.js"

export const describeTableParamsSchema = {
  table_name: z.string().min(1).describe("Name of the table to describe"),
  schema: z.string().optional().describe("Database schema. Default: 'public'"),
}

export interface DescribeTableParams {
  table_name: string
  schema?: string
}

/**
 * Get detailed schema information for a table.
 */
export async function describeTable(params: DescribeTableParams): Promise<ToolResult> {
  const { table_name, schema = "public" } = params

  if (!table_name || typeof table_name !== "string") {
    return errorResult("Invalid table name", "table_name is required")
  }

  // Get Supabase context
  const context = await getSupabaseContext()
  if (isToolError(context)) {
    return context
  }

  // Query columns
  const columnsQuery = `
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = '${schema}' AND table_name = '${table_name}'
    ORDER BY ordinal_position
  `

  const columnsResult = await executeQuery(context.accessToken, context.projectRef, columnsQuery, true)

  if (columnsResult.error) {
    return errorResult("Failed to describe table", columnsResult.error)
  }

  const columns = (columnsResult.data || []) as Array<{
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
    character_maximum_length: number | null
  }>

  if (columns.length === 0) {
    return errorResult("Table not found", `Table '${schema}.${table_name}' does not exist.`)
  }

  // Query primary key
  const pkQuery = `
    SELECT a.attname as column_name
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = '${schema}.${table_name}'::regclass
    AND i.indisprimary
  `

  const pkResult = await executeQuery(context.accessToken, context.projectRef, pkQuery, true)
  const pkColumns = new Set(((pkResult.data || []) as Array<{ column_name: string }>).map(r => r.column_name))

  // Query foreign keys
  const fkQuery = `
    SELECT
      kcu.column_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = '${schema}'
      AND tc.table_name = '${table_name}'
  `

  const fkResult = await executeQuery(context.accessToken, context.projectRef, fkQuery, true)
  const fkMap = new Map(
    (
      (fkResult.data || []) as Array<{
        column_name: string
        foreign_table_schema: string
        foreign_table_name: string
        foreign_column_name: string
      }>
    ).map(fk => [fk.column_name, `→ ${fk.foreign_table_schema}.${fk.foreign_table_name}(${fk.foreign_column_name})`]),
  )

  // Format output
  const lines = columns.map(col => {
    const parts: string[] = []

    // Column name and type
    let typeStr = col.data_type
    if (col.character_maximum_length) {
      typeStr += `(${col.character_maximum_length})`
    }
    parts.push(`${col.column_name}: ${typeStr}`)

    // Constraints
    const constraints: string[] = []
    if (pkColumns.has(col.column_name)) constraints.push("PRIMARY KEY")
    if (col.is_nullable === "NO") constraints.push("NOT NULL")
    if (col.column_default) constraints.push(`DEFAULT ${col.column_default}`)
    if (fkMap.has(col.column_name)) constraints.push(fkMap.get(col.column_name)!)

    if (constraints.length > 0) {
      parts.push(`  [${constraints.join(", ")}]`)
    }

    return parts.join("")
  })

  return successResult(`Table: ${schema}.${table_name}\n\nColumns (${columns.length}):\n${lines.join("\n")}`)
}

export const describeTableTool = tool(
  "describe_table",
  `Get detailed schema information for a specific table.

Returns column names, data types, nullability, defaults, primary keys, and foreign key relationships.

Parameters:
- table_name: Name of the table (required)
- schema: Database schema (default: 'public')

Use this to understand table structure before writing queries or making schema changes.`,
  describeTableParamsSchema,
  async args => {
    return describeTable(args as DescribeTableParams)
  },
)
