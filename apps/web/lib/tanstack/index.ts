/**
 * TanStack Query - Centralized exports
 *
 * Import everything from here:
 * @example
 * import { queryKeys, fetcher, useUpdateOrganization } from '@/lib/tanstack'
 */

// Re-export commonly used TanStack Query hooks
export {
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

// Configuration
export { createQueryClient, getRetryDelay } from "./config"
// DevTools (lazy loaded)
export { default as QueryDevTools } from "./devtools"
// Fetcher with error handling
export { ApiError, type ApiResponse, fetcher } from "./fetcher"
// Custom hooks
export { parseQueryError, type QueryError, useQueryError, useQueryWithError } from "./hooks"
// Mutations
export {
  useCreateWebsite,
  useInvalidateAutomations,
  useInvalidateOrganizations,
  useInvalidateUser,
  useInvalidateWorkspaces,
  useRemoveOrgMember,
  useUpdateOrganization,
  useUpdateUser,
} from "./mutations"
// Query keys factory
export { queryKeys } from "./queryKeys"
