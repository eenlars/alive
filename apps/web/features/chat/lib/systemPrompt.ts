import { coreInstructionsReminder } from "./work"

interface SystemPromptParams {
  projectId?: string
  userId?: string
  workspaceFolder?: string
  hasStripeMcpAccess?: boolean
  hasGmailAccess?: boolean
  additionalContext?: string
  isProduction?: boolean
}

export function getSystemPrompt(params: SystemPromptParams = {}): string {
  const { projectId, userId, workspaceFolder, hasStripeMcpAccess, hasGmailAccess, additionalContext, isProduction } =
    params

  const now = new Date()
  const currentDate = `${now.getDate()} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][now.getMonth()]} ${now.getFullYear()}`

  let prompt = `Date: ${currentDate}. Current time: ${now.toISOString()}. Read CLAUDE.md first. Read the current project structure before making changes. The user is usually looking at a specific page — find which one.`

  if (hasStripeMcpAccess) {
    prompt +=
      " STRIPE: Use Stripe MCP tools for all payment-related requests. Do not implement payment features manually."
  }

  if (hasGmailAccess) {
    prompt +=
      " GMAIL: Use mcp__gmail__compose_email for all email requests. Never write emails as plain text — always use the tool so the user can review and send."
  }

  prompt +=
    " Before debugging, installing packages, or implementing features: call list_workflows() then get_workflow() and follow the steps."

  if (projectId) {
    prompt += ` Project: ${projectId}.`
  }

  if (userId) {
    prompt += ` User: ${userId}.`
  }

  if (workspaceFolder && workspaceFolder !== "/src") {
    prompt += ` Workspace: ${workspaceFolder}.`
  }

  if (additionalContext) {
    prompt += ` ${additionalContext}`
  }

  if (isProduction) {
    prompt +=
      " PRODUCTION MODE: Changes are not live until you rebuild. Make all changes first, then run switch_serve_mode({ mode: 'build' }) once. Or switch to dev mode for live editing."
  }

  prompt += ` ${coreInstructionsReminder}`

  return prompt
}
