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

export { runQueryTool, runQuery, runQueryParamsSchema, type RunQueryParams } from "./run-query.js"
export {
  listProjectsTool,
  listProjects,
  listProjectsParamsSchema,
  type ListProjectsParams,
} from "./list-projects.js"
export { listTablesTool, listTables, listTablesParamsSchema, type ListTablesParams } from "./list-tables.js"
export {
  describeTableTool,
  describeTable,
  describeTableParamsSchema,
  type DescribeTableParams,
} from "./describe-table.js"
