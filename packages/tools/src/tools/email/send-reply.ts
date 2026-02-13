import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

const sendReplyParamsSchema = {
  text: z
    .string()
    .min(1)
    .describe(
      "The complete email reply to send. Write naturally in character. Do not include email headers, signatures, or metadata — just the body text.",
    ),
}

/**
 * Send the final email reply.
 *
 * This tool is ONLY available during email-triggered automations.
 * When Claude calls this tool, the text becomes the email body sent to the sender.
 * Claude should use other tools first to explore and gather information,
 * then call this tool once with the composed reply.
 */
export const sendReplyTool = tool(
  "send_reply",
  "Send your composed email reply to the person who emailed you. Call this ONCE when you've finished composing your response. The text you provide will be sent as the email body. Take your time — use other tools first to explore, think, and gather information before composing your reply.",
  sendReplyParamsSchema,
  async args => {
    // The tool itself doesn't send anything — the executor extracts the text
    // from the tool call in the message history after execution completes.
    return {
      content: [{ type: "text" as const, text: `Reply queued for delivery (${args.text.length} chars).` }],
    }
  },
)
