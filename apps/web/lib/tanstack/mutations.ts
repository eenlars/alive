/**
 * TanStack Query mutation utilities
 *
 * Provides:
 * - Type-safe mutation hooks
 * - Automatic cache invalidation
 * - Optimistic updates
 * - Error handling
 */

import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import toast from "react-hot-toast"
import { type ApiError, delly, patchy, postty } from "@/lib/api/api-client"
import { type Res, validateRequest } from "@/lib/api/schemas"
import { queryKeys } from "./queryKeys"

// ============================================
// Mutation Types
// ============================================

interface MutationContext<T> {
  previousData?: T
}

// ============================================
// Organization Mutations
// ============================================

interface UpdateOrgParams {
  orgId: string
  name: string
}

/**
 * Update organization name
 * Automatically invalidates org cache on success
 */
export function useUpdateOrganization(
  options?: UseMutationOptions<Res<"auth/organizations/update">, ApiError, UpdateOrgParams, MutationContext<unknown>>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orgId, name }: UpdateOrgParams) => {
      const body = validateRequest("auth/organizations/update", {
        org_id: orgId,
        name,
      })
      return patchy("auth/organizations/update", body, undefined, "/api/auth/organizations")
    },
    onSuccess: () => {
      // Invalidate org queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all })
      toast.success("Organization updated")
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to update organization")
    },
    ...options,
  })
}

// ============================================
// Workspace Mutations
// ============================================

interface CreateWebsiteParams {
  domain: string
  orgId: string
  templateId?: string
}

/**
 * Create a new website
 * Invalidates workspace cache on success
 */
export function useCreateWebsite(
  options?: UseMutationOptions<Res<"deploy-subdomain">, ApiError, CreateWebsiteParams, MutationContext<unknown>>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domain, orgId, templateId }: CreateWebsiteParams) => {
      const body = validateRequest("deploy-subdomain", {
        domain,
        org_id: orgId,
        template_id: templateId,
      })
      return postty("deploy-subdomain", body)
    },
    onSuccess: data => {
      // Invalidate workspace queries
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all })
      toast.success(`Created ${data.domain}`)
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to create website")
    },
    ...options,
  })
}

// ============================================
// Member Mutations
// ============================================

interface RemoveMemberParams {
  orgId: string
  userId: string
}

/**
 * Remove member from organization
 * Invalidates member cache on success
 */
export function useRemoveOrgMember(
  options?: UseMutationOptions<Res<"auth/org-members/delete">, ApiError, RemoveMemberParams, MutationContext<unknown>>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orgId, userId }: RemoveMemberParams) => {
      const body = validateRequest("auth/org-members/delete", {
        orgId,
        targetUserId: userId,
      })

      return delly("auth/org-members/delete", body, undefined, "/api/auth/org-members")
    },
    onSuccess: (_, { orgId }) => {
      // Invalidate member queries for this org
      queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers.forOrg(orgId) })
      toast.success("Member removed")
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to remove member")
    },
    ...options,
  })
}

// ============================================
// User Mutations
// ============================================

interface UpdateUserParams {
  name?: string
  email?: string
}

/**
 * Update user profile
 */
export function useUpdateUser(
  options?: UseMutationOptions<Res<"user/update">, ApiError, UpdateUserParams, MutationContext<unknown>>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateUserParams) => {
      const body = validateRequest("user/update", params)
      return patchy("user/update", body, undefined, "/api/user")
    },
    onSuccess: () => {
      // Invalidate user queries
      queryClient.invalidateQueries({ queryKey: queryKeys.user.all })
      toast.success("Profile updated")
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to update profile")
    },
    ...options,
  })
}

// ============================================
// Invalidation Helpers
// ============================================

/**
 * Invalidate all workspace-related queries
 * Use after adding/removing workspaces
 */
export function useInvalidateWorkspaces() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all })
  }
}

/**
 * Invalidate all organization-related queries
 * Use after updating organizations
 */
export function useInvalidateOrganizations() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all })
  }
}

/**
 * Invalidate user data
 * Use after profile updates or auth changes
 */
export function useInvalidateUser() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.user.all })
  }
}

/**
 * Invalidate automations data
 * Use after creating/updating/deleting automations
 */
export function useInvalidateAutomations() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.automations.all })
  }
}
