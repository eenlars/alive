/**
 * Shared Zod schemas for the automation worker ↔ web app contract.
 *
 * Used by:
 * - apps/worker (request sender, response parser)
 * - apps/web/app/api/internal/automation/trigger (request parser, response sender)
 */

import { z } from "zod"

/**
 * JSON-serializable value — structurally compatible with Supabase's `Json` type.
 * Defined here so the shared package doesn't depend on @webalive/database.
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const jsonLiteral = z.union([z.string(), z.number(), z.boolean(), z.null()])
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonLiteral, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
)

/** POST /api/internal/automation/trigger — request body */
export const AutomationTriggerRequestSchema = z.object({
  jobId: z.string().min(1),
  /** Full prompt override (e.g. email content with conversation history) */
  promptOverride: z.string().optional(),
  /** Metadata about what triggered the run (e.g. email from/subject/messageId) */
  triggerContext: z.record(z.string(), jsonValueSchema).optional(),
  /** Custom system prompt — replaces default automation system prompt entirely */
  systemPromptOverride: z.string().optional(),
  /** Additional MCP tool names to register (e.g. ["mcp__alive-email__send_reply"]) */
  extraTools: z.array(z.string()).optional(),
  /** When set, extract the response from this tool's input.text instead of text messages */
  responseToolName: z.string().optional(),
})

/** POST /api/internal/automation/trigger — response body */
export const AutomationTriggerResponseSchema = z.object({
  ok: z.boolean(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
  response: z.string().optional(),
})

export type AutomationTriggerRequest = z.infer<typeof AutomationTriggerRequestSchema>
export type AutomationTriggerResponse = z.infer<typeof AutomationTriggerResponseSchema>
