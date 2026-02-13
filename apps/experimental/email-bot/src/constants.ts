/**
 * Tool name constants for the email-bot.
 * Must match AUTOMATION constants in @webalive/tools/tool-names.
 */
export const AUTOMATION = {
  /** Full MCP tool name — used in extraTools to register the tool */
  SEND_REPLY: "mcp__alive-email__send_reply",
  /** Bare tool name — used in responseToolName for extraction matching */
  SEND_REPLY_BARE: "send_reply",
} as const
