/**
 * Feedback types for user feedback storage
 */

export interface FeedbackEntry {
  id: string
  workspace: string
  feedback: string
  timestamp: string
  closed?: boolean
  closedAt?: string
  userAgent?: string
  conversationId?: string
  email?: string
}

export interface FeedbackStore {
  entries: FeedbackEntry[]
}
