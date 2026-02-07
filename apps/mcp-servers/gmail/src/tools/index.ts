/**
 * Gmail MCP Tools
 *
 * Tool definitions and execution handlers for Gmail operations.
 *
 * DISABLED TOOLS:
 * - send_email: Disabled for MCP - only available via REST API /api/send (user must click)
 * - create_draft: Disabled for MCP - only available via REST API /api/draft (user must click)
 */

import type { gmail_v1 } from "@googleapis/gmail"
import { z } from "zod"
import { getEmail, getUserProfile, listLabels, modifyLabels, searchEmails, trashEmail } from "../gmail-client.js"

// Tools disabled for MCP (only available via REST API)
// User must click Send/Save Draft - Claude cannot send emails directly
const DISABLED_TOOLS = new Set(["send_email", "create_draft"])

// All tool definitions (including disabled ones for reference)
const allTools = [
  {
    name: "compose_email",
    description:
      "Compose an email for the user to review. Returns structured data that displays as an email card with Send/Save buttons. The user must click Send or Save Draft - this tool does NOT send or save anything automatically. Use this when the user asks you to write/draft/compose an email.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body (plain text)",
        },
        cc: {
          type: "string",
          description: "CC recipients (optional)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "get_profile",
    description: "Get the authenticated user's Gmail profile (email address and message count)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_emails",
    description:
      "Search emails using Gmail query syntax. Examples: 'from:someone@example.com', 'subject:invoice', 'is:unread', 'newer_than:7d'",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Gmail search query (e.g., 'is:unread', 'from:boss@example.com', 'subject:urgent')",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results (default: 10, max: 50)",
          default: 10,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_email",
    description: "Get the full content of a specific email by its ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The email message ID",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "send_email",
    description: "DISABLED: Send an email. Use compose_email instead - user must click Send.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        cc: { type: "string", description: "CC recipients (optional)" },
        bcc: { type: "string", description: "BCC recipients (optional)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_draft",
    description: "DISABLED: Save a draft. Use compose_email instead - user must click Save Draft.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        cc: { type: "string", description: "CC recipients (optional)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "list_labels",
    description: "List all Gmail labels (folders/categories)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "archive_email",
    description: "Archive an email (remove from inbox but keep in All Mail)",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The email message ID to archive",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "mark_as_read",
    description: "Mark an email as read",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The email message ID",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "mark_as_unread",
    description: "Mark an email as unread",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The email message ID",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "trash_email",
    description: "Move an email to trash",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The email message ID to trash",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "add_label",
    description: "Add a label to an email",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The email message ID",
        },
        labelId: {
          type: "string",
          description: "The label ID to add (use list_labels to find IDs)",
        },
      },
      required: ["messageId", "labelId"],
    },
  },
  {
    name: "remove_label",
    description: "Remove a label from an email",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The email message ID",
        },
        labelId: {
          type: "string",
          description: "The label ID to remove",
        },
      },
      required: ["messageId", "labelId"],
    },
  },
]

// Export only enabled tools (filter out disabled ones)
export const tools = allTools.filter(tool => !DISABLED_TOOLS.has(tool.name))

// Zod schemas for validation
const searchSchema = z.object({
  query: z.string(),
  maxResults: z.number().min(1).max(50).default(10),
})

const messageIdSchema = z.object({
  messageId: z.string(),
})

const composeEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  cc: z.string().optional(),
})

const labelSchema = z.object({
  messageId: z.string(),
  labelId: z.string(),
})

// Tool execution
export async function executeTool(
  gmail: gmail_v1.Gmail,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    switch (toolName) {
      case "compose_email": {
        // Returns structured data for UI - does NOT save to Gmail
        // User must click Send or Save Draft button
        const { to, subject, body, cc } = composeEmailSchema.parse(args)
        const emailData = {
          to: [to],
          cc: cc ? [cc] : undefined,
          subject,
          body,
          status: "draft" as const,
        }
        return {
          content: [{ type: "text", text: JSON.stringify(emailData) }],
        }
      }

      case "get_profile": {
        const profile = await getUserProfile(gmail)
        return {
          content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
        }
      }

      case "search_emails": {
        const { query, maxResults } = searchSchema.parse(args)
        const emails = await searchEmails(gmail, query, maxResults)
        return {
          content: [
            {
              type: "text",
              text: emails.length ? JSON.stringify(emails, null, 2) : `No emails found matching: ${query}`,
            },
          ],
        }
      }

      case "get_email": {
        const { messageId } = messageIdSchema.parse(args)
        const email = await getEmail(gmail, messageId)
        return {
          content: [{ type: "text", text: JSON.stringify(email, null, 2) }],
        }
      }

      // send_email and create_draft are DISABLED for MCP but kept for reference
      // They return an error if called via MCP - use REST API instead
      case "send_email": {
        return {
          content: [
            {
              type: "text",
              text: "Error: send_email is disabled. Use compose_email instead - user must click Send button.",
            },
          ],
          isError: true,
        }
      }

      case "create_draft": {
        return {
          content: [
            {
              type: "text",
              text: "Error: create_draft is disabled. Use compose_email instead - user must click Save Draft button.",
            },
          ],
          isError: true,
        }
      }

      case "list_labels": {
        const labels = await listLabels(gmail)
        return {
          content: [{ type: "text", text: JSON.stringify(labels, null, 2) }],
        }
      }

      case "archive_email": {
        const { messageId } = messageIdSchema.parse(args)
        await modifyLabels(gmail, messageId, [], ["INBOX"])
        return {
          content: [{ type: "text", text: `Email ${messageId} archived successfully` }],
        }
      }

      case "mark_as_read": {
        const { messageId } = messageIdSchema.parse(args)
        await modifyLabels(gmail, messageId, [], ["UNREAD"])
        return {
          content: [{ type: "text", text: `Email ${messageId} marked as read` }],
        }
      }

      case "mark_as_unread": {
        const { messageId } = messageIdSchema.parse(args)
        await modifyLabels(gmail, messageId, ["UNREAD"], [])
        return {
          content: [{ type: "text", text: `Email ${messageId} marked as unread` }],
        }
      }

      case "trash_email": {
        const { messageId } = messageIdSchema.parse(args)
        await trashEmail(gmail, messageId)
        return {
          content: [{ type: "text", text: `Email ${messageId} moved to trash` }],
        }
      }

      case "add_label": {
        const { messageId, labelId } = labelSchema.parse(args)
        await modifyLabels(gmail, messageId, [labelId], [])
        return {
          content: [{ type: "text", text: `Label ${labelId} added to email ${messageId}` }],
        }
      }

      case "remove_label": {
        const { messageId, labelId } = labelSchema.parse(args)
        await modifyLabels(gmail, messageId, [], [labelId])
        return {
          content: [{ type: "text", text: `Label ${labelId} removed from email ${messageId}` }],
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
          isError: true,
        }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    }
  }
}
