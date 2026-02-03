/**
 * Organization member permission utilities
 *
 * Centralizes permission logic for member management to ensure consistency
 * between UI and backend, and to make permissions easily testable and reusable.
 */

export type OrgRole = "owner" | "admin" | "member"

/**
 * Check if a user can remove another member from an organization
 *
 * Permission rules:
 * - Owner: Can remove anyone except themselves
 * - Admin: Can remove members only (not other admins or owners)
 * - Member: Cannot remove anyone
 * - Nobody can remove themselves
 *
 * @param currentUserRole - The role of the user performing the action
 * @param targetUserRole - The role of the user being removed
 * @param isCurrentUser - Whether the target is the current user (self-removal check)
 * @returns true if removal is permitted
 */
export function canRemoveMember(
  currentUserRole: OrgRole | null | undefined,
  targetUserRole: OrgRole,
  isCurrentUser: boolean,
): boolean {
  // Cannot remove yourself
  if (isCurrentUser) return false

  // No role = no permission
  if (!currentUserRole) return false

  // Members cannot remove anyone
  if (currentUserRole === "member") return false

  // Admins can only remove members
  if (currentUserRole === "admin") {
    return targetUserRole === "member"
  }

  // Owners can remove anyone (except themselves, already checked above)
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
  return userRole === "owner" || userRole === "admin"
}

/**
 * Check if a user can invite members to an organization
 *
 * @param userRole - The user's role in the organization
 * @returns true if user can invite members
 */
export function canInviteMembers(userRole: OrgRole | null | undefined): boolean {
  return userRole === "owner" || userRole === "admin"
}
