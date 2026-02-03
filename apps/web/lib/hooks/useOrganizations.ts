"use client"

import type { Organization } from "@/lib/api/types"
import { useOrganizationsQuery } from "./useSettingsQueries"

interface UseOrganizationsOptions {
  /**
   * Whether to fetch immediately on mount
   * @default true
   */
  immediate?: boolean
}

interface UseOrganizationsReturn {
  organizations: Organization[]
  currentUserId: string | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch organizations with automatic org selection
 *
 * This is a wrapper around useOrganizationsQuery that provides
 * backwards-compatible interface while using TanStack Query under the hood.
 *
 * ## Benefits
 * - Automatic caching (10 min fresh - orgs rarely change)
 * - Automatic deduplication (10 components = 1 request)
 * - Background refetching
 * - Auth store integration (401 handling, marks authenticated on success)
 * - Workspace validation/cleanup on fetch
 *
 * @example
 * ```tsx
 * const { organizations, loading, error, refetch } = useOrganizations()
 *
 * if (loading) return <Spinner />
 * if (error) return <Error message={error} onRetry={refetch} />
 *
 * return <OrgList organizations={organizations} />
 * ```
 */
export function useOrganizations(options: UseOrganizationsOptions = {}): UseOrganizationsReturn {
  const { immediate = true } = options

  const query = useOrganizationsQuery()

  // When immediate=false, we simulate the old behavior by not considering initial loading
  const loading = immediate ? query.isLoading : false

  return {
    organizations: query.data?.organizations ?? [],
    currentUserId: query.data?.current_user_id ?? null,
    loading,
    error: query.error?.message ?? null,
    refetch: async () => {
      await query.refetch()
    },
  }
}
