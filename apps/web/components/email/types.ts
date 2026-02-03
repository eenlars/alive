/**
 * Email Draft Types
 *
 * Shared types for email drafting feature.
 * Feature-flagged for superadmin only.
 */

/**
 * Email draft data structure
 */
export interface EmailDraft {
  /** Gmail draft ID (if saved) */
  id?: string
  /** Recipients */
  to: string[]
  /** CC recipients */
  cc?: string[]
  /** BCC recipients */
  bcc?: string[]
  /** Email subject */
  subject: string
  /** Email body (plain text or HTML) */
  body: string
  /** Thread ID for replies */
  threadId?: string
  /** Draft status */
  status: "draft" | "saving" | "saved" | "sending" | "sent" | "error"
  /** Error message if status is error */
  error?: string
  /** Timestamp when created */
  createdAt?: string
}

/**
 * Email action result (for send/save confirmations)
 */
export interface EmailActionResult {
  success: boolean
  action: "send" | "save_draft"
  messageId?: string
  draftId?: string
  error?: string
  timestamp: string
}

/**
 * Props for email draft output renderer
 */
export interface EmailDraftOutputProps {
  draft: EmailDraft
  /** Callback when user clicks Send */
  onSend?: (draft: EmailDraft) => Promise<void>
  /** Callback when user clicks Save Draft */
  onSaveDraft?: (draft: EmailDraft) => Promise<void>
  /** Callback when user edits the draft */
  onEdit?: (draft: EmailDraft) => void
  /** Whether actions are disabled (e.g., during sending) */
  actionsDisabled?: boolean
}

/**
 * Fake email drafts for superadmin testing
 */
export const FAKE_EMAIL_DRAFTS: EmailDraft[] = [
  {
    id: "draft-001",
    to: ["client@example.com"],
    subject: "Project Update - Week 47",
    body: `Hi Sarah,

I wanted to give you a quick update on the project progress this week.

Key achievements:
- Completed the new dashboard design
- Integrated the payment system
- Fixed 12 bugs from the backlog

Next week we'll focus on:
- User testing sessions
- Performance optimization
- Documentation updates

Let me know if you have any questions!

Best regards,
John`,
    status: "draft",
    createdAt: new Date().toISOString(),
  },
  {
    id: "draft-002",
    to: ["team@example.com"],
    cc: ["manager@example.com"],
    subject: "Meeting Notes - Sprint Planning",
    body: `Team,

Here are the key takeaways from today's sprint planning:

Sprint Goals:
1. Launch beta version of the mobile app
2. Complete API documentation
3. Set up monitoring dashboards

Action Items:
- Alex: Finalize UI components by Wednesday
- Maria: Review security requirements
- Tom: Set up staging environment

Next meeting: Friday 2pm

Thanks,
Product Team`,
    status: "draft",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
]
