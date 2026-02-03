/**
 * Linear GraphQL Query Builder
 *
 * Extracted for testability. The query structure is validated by tests
 * to prevent GraphQL validation errors at runtime.
 */

export interface QueryOptions {
  includeCompleted: boolean
}

/**
 * Linear workflow state types (from Linear API)
 * - backlog: Issues in backlog
 * - unstarted: Not yet started
 * - started: In progress
 * - completed: Done/finished
 * - canceled: Canceled/won't do
 */
const EXCLUDED_STATE_TYPES = ["completed", "canceled"]

/**
 * Common state names to exclude (catches custom workflows)
 * These are filtered case-insensitively by Linear
 */
const EXCLUDED_STATE_NAMES = ["Done", "Duplicate", "Won't Fix", "Cancelled"]

/**
 * Build the GraphQL query for fetching assigned issues.
 *
 * IMPORTANT: State filtering must use the `filter` argument, NOT a direct
 * `state` argument. Linear's API will reject:
 *   assignedIssues(state: { ... })  // WRONG
 *
 * Correct usage:
 *   assignedIssues(filter: { state: { ... } })  // CORRECT
 */
export function buildLinearIssuesQuery(options: QueryOptions): string {
  // Build filter - exclude completed/canceled states by default
  // Filters by both type (catches standard states) and name (catches custom workflows)
  // MUST be nested inside filter: { }, not as a direct argument
  const filterArg = options.includeCompleted
    ? ""
    : `filter: {
        state: {
          type: { nin: ${JSON.stringify(EXCLUDED_STATE_TYPES)} },
          name: { nin: ${JSON.stringify(EXCLUDED_STATE_NAMES)} }
        }
      }`

  return `
    query MyIssues($limit: Int!) {
      viewer {
        assignedIssues(
          first: $limit
          orderBy: updatedAt
          ${filterArg}
        ) {
          nodes {
            id
            identifier
            title
            description
            priority
            priorityLabel
            url
            createdAt
            updatedAt
            state {
              id
              name
              color
              type
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    }
  `
}
