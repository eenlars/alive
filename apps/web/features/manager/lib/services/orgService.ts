/**
 * Organization management service - pure, testable functions
 */

import type { OrgRole } from "@webalive/shared"
import type { Res } from "@/lib/api/schemas"

// ============================================================================
// Manager Organization Types (derived from API schema)
// ============================================================================

/** Full organization data as returned by the manager API */
export type ManagerOrganization = Res<"manager/orgs">["orgs"][number]

/** Organization member */
export type ManagerOrgMember = ManagerOrganization["members"][number]

/** Organization domain */
export type ManagerOrgDomain = ManagerOrganization["domains"][number]

// ============================================================================
// Request Types
// ============================================================================

export interface OrgDeleteRequest {
  orgId: string
}

export interface RemoveMemberRequest {
  orgId: string
  userId: string
}

export interface TransferOwnershipRequest {
  orgId: string
  newOwnerId: string
}

export interface UpdateCreditsRequest {
  orgId: string
  credits: number
}

export interface AddMemberRequest {
  orgId: string
  userId: string
  role: OrgRole
}

export async function deleteOrg(orgId: string): Promise<void> {
  const response = await fetch("/api/manager/orgs", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: orgId }),
  })

  if (!response.ok) {
    throw new Error("Failed to delete organization")
  }
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const response = await fetch("/api/manager/orgs/members", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: orgId, user_id: userId }),
  })

  if (!response.ok) {
    throw new Error("Failed to remove member")
  }
}

export async function transferOwnership(orgId: string, newOwnerId: string): Promise<void> {
  const response = await fetch("/api/manager/orgs/transfer-ownership", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, newOwnerId }),
  })

  if (!response.ok) {
    throw new Error("Failed to transfer ownership")
  }
}

export async function updateOrgCredits(orgId: string, credits: number): Promise<void> {
  const response = await fetch("/api/manager/orgs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: orgId, credits }),
  })

  if (!response.ok) {
    throw new Error("Failed to update organization credits")
  }
}

export async function addOrgMember(orgId: string, userId: string, role: OrgRole): Promise<void> {
  const response = await fetch("/api/manager/orgs/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: orgId, user_id: userId, role }),
  })

  if (!response.ok) {
    throw new Error("Failed to add member")
  }
}

export interface CreateOrgRequest {
  name: string
  credits?: number
  ownerUserId?: string
}

export interface CreateOrgResponse {
  ok: boolean
  message?: string
  orgId?: string
}

export async function createOrg(data: CreateOrgRequest): Promise<CreateOrgResponse> {
  const response = await fetch("/api/manager/orgs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to create organization")
  }

  return response.json()
}
