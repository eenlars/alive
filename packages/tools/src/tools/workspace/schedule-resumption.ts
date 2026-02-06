import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { callBridgeApi, type ToolResult } from "../../lib/api-client.js"

export const scheduleResumptionParamsSchema = {
  delay_minutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .describe(
      "Minutes to wait before resuming this conversation (1-1440, max 24 hours). Choose based on what you're waiting for: 1-5 for quick builds, 10-30 for deployments, 60+ for long-running processes.",
    ),
  reason: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "Why you are scheduling this resumption (shown to the user in the UI). Be specific: 'Waiting for DNS propagation' not just 'Waiting'.",
    ),
  resume_message: z
    .string()
    .max(2000)
    .optional()
    .describe(
      "Optional message to inject when the conversation resumes. This becomes your prompt when you wake up. Example: 'Check if the deploy to production succeeded by testing the homepage.'",
    ),
}

export type ScheduleResumptionParams = {
  delay_minutes: number
  reason: string
  resume_message?: string
}

export async function scheduleResumption(params: ScheduleResumptionParams): Promise<ToolResult> {
  const { delay_minutes, reason, resume_message } = params

  // Get tab context from environment (set by worker-entry.mjs)
  const tabId = process.env.ALIVE_TAB_ID
  const tabGroupId = process.env.ALIVE_TAB_GROUP_ID

  if (!tabId || !tabGroupId) {
    return {
      content: [
        {
          type: "text",
          text: "Cannot schedule resumption: tab context not available. This tool only works within an active chat session.",
        },
      ],
      isError: true,
    }
  }

  const workspaceRoot = process.cwd()

  const result = await callBridgeApi({
    endpoint: "/api/schedule-resumption",
    body: {
      workspaceRoot,
      delayMinutes: delay_minutes,
      reason,
      resumeMessage: resume_message,
      tabId,
      tabGroupId,
    },
  })

  return result
}

export const scheduleResumptionTool = tool(
  "schedule_resumption",
  "Schedule this conversation to be resumed after a delay. Use when you need to wait for something (deploy, build, DNS propagation, external process) before continuing. The conversation will automatically resume with your specified message after the delay. The user will see a notification that a resumption is scheduled.",
  scheduleResumptionParamsSchema,
  async args => {
    return scheduleResumption(args)
  },
)
