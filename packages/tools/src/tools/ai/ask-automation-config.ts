/**
 * Ask Automation Config Tool
 *
 * Presents an interactive form to configure a scheduled automation.
 * Returns structured data that the frontend renders as a multi-step form.
 *
 * The user can:
 * 1. Enter a task name and prompt
 * 2. Select a website
 * 3. Choose a schedule (once, daily, weekly, monthly, custom cron)
 *
 * After submission, their choices are sent back to Claude to create the automation.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

export const askAutomationConfigParamsSchema = {
  context: z.string().optional().describe("Optional context about why an automation is being created"),
  defaultSiteId: z.string().optional().describe("Optional default site ID to pre-select"),
}

export type AskAutomationConfigParams = {
  context?: string
  defaultSiteId?: string
}

export interface AskAutomationConfigResult {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
  [key: string]: unknown
}

/**
 * Site info passed to the tool via context
 * This is injected by the tool executor, not from parameters
 */
export interface AutomationToolContext {
  sites: Array<{ id: string; hostname: string }>
}

/**
 * Show the automation configuration form to the user.
 *
 * Returns JSON that the frontend renders as an interactive multi-step form.
 * When the user submits their configuration, it's sent back to Claude as a message.
 */
export async function askAutomationConfig(
  params: AskAutomationConfigParams,
  context?: AutomationToolContext,
): Promise<AskAutomationConfigResult> {
  try {
    const { context: userContext, defaultSiteId } = params

    // Get sites from context (injected by executor) or return empty
    const sites = context?.sites ?? []

    if (sites.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No websites available. Please create a website first before setting up automations.",
          },
        ],
        isError: true,
      }
    }

    const responseData = {
      type: "automation_config",
      sites,
      defaultSiteId,
      context: userContext,
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(responseData),
        },
      ],
      isError: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      content: [
        {
          type: "text",
          text: `Error creating automation config form: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}

export const askAutomationConfigTool = tool(
  "ask_automation_config",
  `Show an interactive form for the user to configure a scheduled automation.

Use this tool when:
- The user wants to create a scheduled task or automation
- The user says something like "schedule a task", "set up an automation", "remind me daily", "run something every week"
- You need to collect automation details (name, prompt, schedule, website)

The form collects:
1. **Task name** - What to call this automation
2. **Prompt** - What Claude should do when the automation runs
3. **Website** - Which site this automation is for
4. **Schedule** - When to run (once, daily, weekly, monthly, or custom cron)

After the user submits, their configuration is sent back as a message.
Then create the automation via the automations API.

Example flow:
1. User: "Set up a daily task to check my website"
2. You: Call ask_automation_config to show the form
3. User submits: "Task: Daily check, Website: mybakery.sonno.tech, Schedule: Daily at 09:00..."
4. You: Create the automation via POST /api/automations`,
  askAutomationConfigParamsSchema,
  async args => {
    // Note: In actual execution, the context with sites will be injected
    // by the tool executor. This is a placeholder that returns empty sites.
    return askAutomationConfig(args)
  },
)
