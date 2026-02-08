/**
 * Simple wrapper for asking Claude a question using the Claude Agent SDK.
 *
 * Uses the Claude Code instance credentials - no API key needed.
 *
 * @example
 * ```typescript
 * import { askAI } from "@webalive/tools"
 *
 * const response = await askAI({
 *   question: "What is the capital of France?",
 * })
 * console.log(response) // "The capital of France is Paris."
 *
 * // With custom model and max turns
 * const response2 = await askAI({
 *   question: "Explain quantum computing",
 *   model: CLAUDE_MODELS.SONNET_4_5,  // "claude-sonnet-4-5"
 *   maxTurns: 3,
 * })
 * ```
 */

import { query } from "@anthropic-ai/claude-agent-sdk"
import { DEFAULTS, CLAUDE_MODELS, type ClaudeModel } from "@webalive/shared"

// Re-export from shared for backwards compatibility
export { CLAUDE_MODELS, type ClaudeModel }

export interface AskAIOptions {
  /** The question or prompt to send to Claude */
  question: string
  /** The model to use (defaults to DEFAULTS.CLAUDE_MODEL from shared config) */
  model?: ClaudeModel | string
  /** Maximum conversation turns (defaults to 1 for simple Q&A) */
  maxTurns?: number
}

/**
 * Ask Claude a question and get a text response.
 *
 * No tools are enabled by default - this is for simple text generation.
 * Uses Claude Code instance credentials (no API key needed).
 *
 * @param options - The question and optional configuration
 * @returns The text response from Claude
 * @throws Error if Claude doesn't respond or there's an API error
 */
export async function askAI(options: AskAIOptions): Promise<string> {
  const { question, model = DEFAULTS.CLAUDE_MODEL, maxTurns = 1 } = options

  const agentQuery = query({
    prompt: question,
    options: {
      model,
      maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      allowedTools: [], // No tools by default
    },
  })

  let responseText = ""

  for await (const message of agentQuery) {
    if (message.type === "assistant" && "message" in message) {
      const content = message.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            responseText += block.text
          }
        }
      }
    }
  }

  if (!responseText) {
    throw new Error("No response from Claude")
  }

  return responseText
}
