import type { TriggerResponse } from "./types.js"

// Read env lazily — dotenv loads after static imports resolve
function getTriggerUrl(): string {
  const url = process.env.TRIGGER_URL
  if (!url) throw new Error("TRIGGER_URL environment variable is required")
  return url
}
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET environment variable is required")
  return secret
}

/** Options for the trigger request beyond the basics */
export interface TriggerOptions {
  /** Custom system prompt — replaces default automation system prompt */
  systemPromptOverride?: string
  /** Additional MCP tool names to register */
  extraTools?: string[]
  /** Extract response from this tool's input.text */
  responseToolName?: string
}

/**
 * POST to the internal automation trigger endpoint.
 * This reuses the existing Claude SDK infrastructure (OAuth, worker pool, credits).
 */
export async function triggerAutomation(
  jobId: string,
  promptOverride: string,
  triggerContext: Record<string, unknown>,
  options?: TriggerOptions,
): Promise<TriggerResponse> {
  const triggerUrl = getTriggerUrl()
  const jwtSecret = getJwtSecret()
  const body = JSON.stringify({
    jobId,
    promptOverride,
    triggerContext,
    ...options,
  })

  console.log(`[Trigger] POST ${triggerUrl} jobId=${jobId} prompt=${promptOverride.length} chars`)

  const response = await fetch(triggerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": jwtSecret,
    },
    body,
    signal: AbortSignal.timeout(5 * 60 * 1000), // 5 minute timeout
  })

  const data = (await response.json()) as TriggerResponse

  if (!response.ok) {
    console.error(`[Trigger] Failed: ${response.status}`, data)
    return { ok: false, error: data.error ?? `HTTP ${response.status}` }
  }

  console.log(`[Trigger] OK: ${data.durationMs}ms, response=${data.response?.length ?? 0} chars`)
  return data
}
