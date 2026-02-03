import { appendFile } from "node:fs/promises"
import path from "node:path"
import { ensureDirectory } from "./utils/fs-helpers"

export interface InputLogEntry {
  timestamp: string
  userId: string
  tabId: string // Primary session key
  conversationId?: string // Optional grouping (future: git branches)
  workspace: string
  cwd: string
  messageLength: number
  message: string
  requestId: string
}

const LOG_DIR = path.join(process.cwd(), "logs")
const LOG_FILE = path.join(LOG_DIR, "inputs.jsonl")

/**
 * Logs user input to JSONL file for analytics and debugging.
 * Fails silently to avoid disrupting the main request flow.
 */
export async function logInput(entry: InputLogEntry): Promise<void> {
  try {
    // Ensure log directory exists
    await ensureDirectory(LOG_DIR)

    // Append as JSONL (one JSON object per line)
    const line = `${JSON.stringify(entry)}\n`
    await appendFile(LOG_FILE, line, "utf-8")
  } catch (error) {
    // Log error but don't throw - logging should never break the main flow
    console.error("[Input Logger] Failed to write log:", error)
  }
}
