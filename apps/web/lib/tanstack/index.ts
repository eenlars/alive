/**
 * TanStack Query - Centralized exports
 *
 * Import everything from here:
 * @example
 * import { queryKeys, fetcher, useUpdateOrganization } from '@/lib/tanstack'
 */

// Query keys factory
export { queryKeys } from "./queryKeys"

// Configuration
export { createQueryClient, getRetryDelay } from "./config"

// Fetcher with error handling
export { fetcher, ApiError, type ApiResponse } from "./fetcher"

// Custom hooks
export { useQueryError, useQueryWithError, parseQueryError, type QueryError } from "./hooks"

// Mutations
export {
  useUpdateOrganization,
  useCreateWebsite,
  useRemoveOrgMember,
  useUpdateUser,
  useInvalidateWorkspaces,
  useInvalidateOrganizations,
  useInvalidateUser,
  useInvalidateAutomations,
} from "./mutations"

// DevTools (lazy loaded)
export { default as QueryDevTools } from "./devtools"

// Re-export commonly used TanStack Query hooks
export {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
} from "@tanstack/react-query"
