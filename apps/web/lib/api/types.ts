/**
 * Shared API Types & Type Guards
 *
 * Single source of truth for API request/response types.
 * Used by both API routes and frontend consumers.
 */

// ============================================================================
// Base Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  ok: boolean
  error?: string
  message?: string
  data?: T
}

export interface ApiError {
  ok: false
  error: string
  message?: string
}

// ============================================================================
// Auth API Types
// ============================================================================

export interface Organization {
  org_id: string
  name: string
  credits: number
  workspace_count: number
  role: "owner" | "admin" | "member"
}

export interface OrganizationsResponse {
  ok: true
  organizations: Organization[]
  current_user_id: string
}

export interface WorkspacesResponse {
  ok: true
  workspaces: string[]
}

export interface LoginResponse {
  ok: true
  userId: string
}

export interface LogoutResponse {
  ok: true
  message: string
}

export interface VerifyResponse {
  ok: true
  verified: true
  workspace: string
  message: string
  requestId: string
}

export interface TokensResponse {
  ok: true
  tokens: number
  credits: number
  workspace: string
}

export interface TokensErrorResponse {
  ok: false
  error: string
}

export type TokensAPIResponse = TokensResponse | TokensErrorResponse

// ============================================================================
// Feedback API Types
// ============================================================================

export interface FeedbackResponse {
  ok: true
  id: string
  timestamp: number
}

// ============================================================================
// Referral API Types
// ============================================================================

export interface ReferralData {
  inviteCode: string
  inviteLink: string
  stats: {
    totalReferrals: number
    creditsEarned: number
  }
}

export interface ReferralHistoryItem {
  id: string
  status: "pending" | "completed" | "failed"
  creditsAwarded: number
  createdAt: string
  completedAt: string | null
  referredEmail?: string
  referredName?: string
}

export interface ReferralMeResponse {
  ok: true
  data: ReferralData
}

export interface ReferralRedeemResponse {
  ok: true
  status: "pending" | "completed"
  creditsAwarded?: number
  message?: string
}

export interface ReferralHistoryResponse {
  ok: true
  data: {
    referrals: ReferralHistoryItem[]
  }
}

// Note: Deploy, Sites, and Images APIs use different response formats
// with { success: boolean } or have endpoint-specific structures.
// These are defined locally in their respective route files.

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for basic API response shape
 */
export function isApiResponse(data: unknown): data is ApiResponse {
  return typeof data === "object" && data !== null && "ok" in data && typeof (data as ApiResponse).ok === "boolean"
}

/**
 * Type guard for API error response
 */
export function isApiError(data: unknown): data is ApiError {
  return isApiResponse(data) && data.ok === false && typeof data.error === "string"
}

/**
 * Type guard for successful API response
 */
export function isApiSuccess<T>(data: unknown): data is ApiResponse<T> & { ok: true } {
  return isApiResponse(data) && data.ok === true
}

/**
 * Type guard for Organization object
 */
export function isOrganization(data: unknown): data is Organization {
  return (
    typeof data === "object" &&
    data !== null &&
    "org_id" in data &&
    typeof (data as Organization).org_id === "string" &&
    "name" in data &&
    typeof (data as Organization).name === "string" &&
    "credits" in data &&
    typeof (data as Organization).credits === "number"
  )
}

/**
 * Type guard for OrganizationsResponse
 */
export function isOrganizationsResponse(data: unknown): data is OrganizationsResponse {
  if (!isApiSuccess(data)) return false

  return (
    "organizations" in data &&
    Array.isArray(data.organizations) &&
    data.organizations.every(org => isOrganization(org)) &&
    "current_user_id" in data &&
    typeof (data as OrganizationsResponse).current_user_id === "string"
  )
}

/**
 * Type guard for WorkspacesResponse
 */
export function isWorkspacesResponse(data: unknown): data is WorkspacesResponse {
  if (!isApiSuccess(data)) return false

  return "workspaces" in data && Array.isArray(data.workspaces) && data.workspaces.every(w => typeof w === "string")
}

/**
 * Type guard for LoginResponse
 */
export function isLoginResponse(data: unknown): data is LoginResponse {
  return isApiSuccess(data)
}

/**
 * Type guard for TokensResponse
 */
export function isTokensResponse(data: unknown): data is TokensResponse {
  return (
    isApiSuccess(data) &&
    "tokens" in data &&
    "credits" in data &&
    "workspace" in data &&
    typeof (data as TokensResponse).tokens === "number" &&
    typeof (data as TokensResponse).credits === "number"
  )
}

/**
 * Type guard for ReferralData
 */
export function isReferralData(data: unknown): data is ReferralData {
  return (
    typeof data === "object" &&
    data !== null &&
    "inviteCode" in data &&
    typeof (data as ReferralData).inviteCode === "string" &&
    "inviteLink" in data &&
    typeof (data as ReferralData).inviteLink === "string" &&
    "stats" in data &&
    typeof (data as ReferralData).stats === "object"
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> & { ok: true } {
  return {
    ok: true,
    data,
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(error: string, message?: string): ApiError {
  return {
    ok: false,
    error,
    ...(message && { message }),
  }
}
