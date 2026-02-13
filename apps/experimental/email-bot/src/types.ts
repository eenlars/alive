/** Email job loaded from Supabase automation_jobs */
export interface EmailJob {
  id: string
  name: string
  emailAddress: string
  actionPrompt: string
  actionModel: string | null
  siteId: string
}

/** Parsed incoming email */
export interface ParsedEmail {
  from: string
  to: string
  subject: string
  textBody: string
  htmlBody: string | null
  messageId: string
  inReplyTo: string | null
  references: string[]
  date: Date
  /** Auto-Submitted, X-Auto-Response-Suppress, Precedence headers */
  autoHeaders: {
    autoSubmitted: string | null
    autoResponseSuppress: string | null
    precedence: string | null
  }
}

/** Conversation message stored in SQLite */
export interface ConversationMessage {
  id: number
  mailbox: string
  threadId: string
  messageId: string
  inReplyTo: string | null
  sender: string
  subject: string | null
  body: string
  direction: "incoming" | "outgoing"
  createdAt: string
}

/** Trigger response from the automation system */
export interface TriggerResponse {
  ok: boolean
  durationMs?: number
  error?: string
  response?: string
}
