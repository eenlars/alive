/**
 * Gmail API Response Types
 *
 * Shared types for Gmail send and draft endpoints.
 * Used by both API routes and frontend components.
 */

/**
 * Successful response from /api/gmail/send
 */
export interface GmailSendResponse {
  ok: true
  messageId: string
  threadId?: string
}

/**
 * Successful response from /api/gmail/draft
 */
export interface GmailDraftResponse {
  ok: true
  draftId: string
  messageId?: string
}

/**
 * Error response from Gmail API endpoints
 */
export interface GmailErrorResponse {
  ok?: false
  success?: false
  message?: string
  reason?: string
}

/**
 * Union type for all Gmail API responses
 */
export type GmailApiResponse = GmailSendResponse | GmailDraftResponse | GmailErrorResponse

/**
 * Type guard for successful send response
 */
export function isGmailSendResponse(response: unknown): response is GmailSendResponse {
  return typeof response === "object" && response !== null && (response as any).ok === true && "messageId" in response
}

/**
 * Type guard for successful draft response
 */
export function isGmailDraftResponse(response: unknown): response is GmailDraftResponse {
  return typeof response === "object" && response !== null && (response as any).ok === true && "draftId" in response
}

/**
 * Type guard for error response
 */
export function isGmailErrorResponse(response: unknown): response is GmailErrorResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    ((response as any).ok === false ||
      (response as any).success === false ||
      "reason" in response ||
      "message" in response)
  )
}
