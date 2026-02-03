import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { ApiError, getty } from "@/lib/api/api-client"
import type { Organization } from "@/lib/api/types"
import type { Res } from "@/lib/api/schemas"
import { authStore } from "@/lib/stores/authStore"
import { useWorkspaceActions } from "@/lib/stores/workspaceStore"
import { queryKeys } from "@/lib/tanstack/queryKeys"

// ============================================
// Types (derived from Zod schemas in schemas.ts)
// ============================================

export type OrgMember = Res<"auth/org-members">["members"][number]
export type AutomationJob = Res<"automations">["automations"][number]
export type AutomationRun = Res<"automations/runs">["runs"][number]
export type Site = Res<"sites">["sites"][number]

// ============================================
// Organization Queries
// ============================================

/**
 * Fetch user organizations with full response (includes current_user_id)
 *
 * Uses getty for type-safe, Zod-validated responses.
 *
 * Benefits:
 * - Automatic caching (10 min fresh - orgs rarely change)
 * - Automatic deduplication (10 components = 1 request)
 * - Type-safe query key for invalidation
 * - Auth store integration (handles 401, marks authenticated on success)
 * - Zod validation ensures response shape is correct
 *
 * @example
 * const { data, isLoading, error } = useOrganizationsQuery()
 * // data?.organizations, data?.current_user_id
 */
export function useOrganizationsQuery() {
  const { validateAndCleanup } = useWorkspaceActions()

  const query = useQuery<Res<"auth/organizations">, ApiError>({
    queryKey: queryKeys.organizations.list(),
    queryFn: async () => {
      try {
        return await getty("auth/organizations")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          authStore.handleSessionExpired("Your session has expired. Please log in again to continue.")
        }
        throw error
      }
    },
    staleTime: 10 * 60 * 1000, // 10 min - orgs rarely change
  })

  // Handle success side effects
  useEffect(() => {
    if (query.data?.organizations) {
      authStore.setAuthenticated()
      validateAndCleanup(query.data.organizations as Organization[])
    }
  }, [query.data, validateAndCleanup])

  return query
}

// ============================================
// Workspace Queries
// ============================================

/**
 * Fetch workspaces for a specific organization
 * Per-org caching prevents unnecessary refetches
 *
 * @example
 * const { data } = useWorkspacesQuery(orgId)
 * // data?.workspaces is string[]
 */
export function useWorkspacesQuery(orgId: string) {
  return useQuery<Res<"auth/workspaces">, ApiError>({
    queryKey: queryKeys.workspaces.forOrg(orgId),
    queryFn: () => getty("auth/workspaces", undefined, `/api/auth/workspaces?org_id=${orgId}`),
    enabled: !!orgId,
  })
}

/**
 * Fetch ALL workspaces for ALL organizations in ONE request
 * Much faster than N individual requests
 *
 * Performance:
 * - Settings page: 1 request instead of N (50-70% faster)
 * - Repeated opens: instant from cache (0 requests)
 *
 * @example
 * const { data } = useAllWorkspacesQuery(organizations)
 * // data?.workspaces is Record<string, string[]>
 */
export function useAllWorkspacesQuery(organizations: Organization[]) {
  return useQuery<Record<string, string[]>, ApiError>({
    queryKey: queryKeys.workspaces.allForUser(),
    queryFn: async () => {
      const response = await getty("auth/all-workspaces")
      return response.workspaces
    },
    enabled: organizations.length > 0,
  })
}

// ============================================
// Member Queries
// ============================================

/**
 * Fetch organization members
 * Cached per org with type-safe key for invalidation
 *
 * @example
 * const { data } = useOrgMembersQuery(orgId)
 * // data?.members is OrgMember[]
 */
export function useOrgMembersQuery(orgId: string) {
  return useQuery<Res<"auth/org-members">, ApiError>({
    queryKey: queryKeys.orgMembers.forOrg(orgId),
    queryFn: () => getty("auth/org-members", undefined, `/api/auth/org-members?orgId=${orgId}`),
    enabled: !!orgId,
  })
}

// ============================================
// Automation Queries
// ============================================

/**
 * Fetch automations for current user
 *
 * @example
 * const { data, isLoading, refetch } = useAutomationsQuery()
 * // data?.automations is AutomationJob[]
 */
export function useAutomationsQuery() {
  return useQuery<Res<"automations">, ApiError>({
    queryKey: queryKeys.automations.list(),
    queryFn: () => getty("automations"),
    staleTime: 2 * 60 * 1000, // 2 min - automations can change
  })
}

// ============================================
// Sites Queries
// ============================================

/**
 * Fetch sites for current user (used in automations, etc.)
 *
 * @example
 * const { data } = useSitesQuery()
 * // data?.sites is Site[]
 */
export function useSitesQuery() {
  return useQuery<Res<"sites">, ApiError>({
    queryKey: queryKeys.sites.list(),
    queryFn: () => getty("sites"),
    staleTime: 5 * 60 * 1000, // 5 min - sites rarely change
  })
}

/**
 * Fetch runs for a specific automation job
 *
 * @example
 * const { data } = useAutomationRunsQuery(jobId)
 * // data?.runs is AutomationRun[]
 */
export function useAutomationRunsQuery(jobId: string | null) {
  return useQuery<Res<"automations/runs">, ApiError>({
    queryKey: queryKeys.automations.runs(jobId ?? ""),
    queryFn: () => getty("automations/runs", undefined, `/api/automations/${jobId}/runs?limit=10`),
    enabled: !!jobId,
    staleTime: 30 * 1000, // 30 sec - runs can change frequently
  })
}
