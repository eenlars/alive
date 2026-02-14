/**
 * Organization member permission utilities
 *
 * Centralizes permission logic for member management to ensure consistency
 * between UI and backend, and to make permissions easily testable and reusable.
 */

import { isOrgAdminRole, type OrgRole } from "@webalive/shared"

export type { OrgRole }

/**
 * Check if a user can remove another member from an organization
 *
 * Permission rules:
 * - Owner: Can remove anyone (self-leave requires additional "last owner" check in route)
 * - Admin: Can remove members only (not other admins or owners), can self-leave
 * - Member: Can only self-leave
 * - Nobody without a role can remove anyone
 *
 * @param currentUserRole - The role of the user performing the action
 * @param targetUserRole - The role of the user being removed
 * @param isCurrentUser - Whether the target is the current user (self-leave)
 * @returns true if removal is permitted
 */
export function canRemoveMember(
  currentUserRole: OrgRole | null | undefined,
  targetUserRole: OrgRole,
  isCurrentUser: boolean,
): boolean {
  // No role = no permission
  if (!currentUserRole) return false

  // Self-leave: any member can leave (route handler enforces "last owner" rule)
  if (isCurrentUser) return true

  // Members cannot remove others
  if (currentUserRole === "member") return false

  // Admins can only remove members
  if (currentUserRole === "admin") {
    return targetUserRole === "member"
  }

  // Owners can remove anyone
  if (currentUserRole === "owner") return true

  return false
}

/**
 * Check if a user can update an organization's settings
 *
 * @param userRole - The user's role in the organization
 * @returns true if user can update organization
 */
export function canUpdateOrganization(userRole: OrgRole | null | undefined): boolean {
  return isOrgAdminRole(userRole)
}

/**
 * Check if a user can invite members to an organization
 *
 * @param userRole - The user's role in the organization
 * @returns true if user can invite members
 */
export function canInviteMembers(userRole: OrgRole | null | undefined): boolean {
  return isOrgAdminRole(userRole)
}
