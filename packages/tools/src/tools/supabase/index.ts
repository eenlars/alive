/**
 * Supabase Tools
 *
 * Tools for interacting with Supabase projects via the Management API.
 * Requires user to connect their Supabase account via OAuth and configure a project ref.
 *
 * Available tools:
 * - run_query: Execute SQL queries (SELECT, INSERT, CREATE TABLE, etc.)
 * - list_projects: List all Supabase projects accessible to the user
 * - list_tables: List all tables in the connected project
 * - describe_table: Get table schema details
 */

export {
  type DescribeTableParams,
  describeTable,
  describeTableParamsSchema,
  describeTableTool,
} from "./describe-table.js"
export {
  type ListProjectsParams,
  listProjects,
  listProjectsParamsSchema,
  listProjectsTool,
} from "./list-projects.js"
export { type ListTablesParams, listTables, listTablesParamsSchema, listTablesTool } from "./list-tables.js"
export { type RunQueryParams, runQuery, runQueryParamsSchema, runQueryTool } from "./run-query.js"
