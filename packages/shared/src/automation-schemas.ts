/**
 * Shared Zod schemas for the automation worker ↔ web app contract.
 *
 * Used by:
 * - apps/worker (request sender, response parser)
 * - apps/web/app/api/internal/automation/trigger (request parser, response sender)
 */

import { z } from "zod"

/** POST /api/internal/automation/trigger — request body */
export const AutomationTriggerRequestSchema = z.object({
  jobId: z.string().min(1),
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
