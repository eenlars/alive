import { Groq } from "groq-sdk"

let groqClient: Groq | null = null

/**
 * Get Groq client instance (server-only)
 * Initializes client lazily on first call
 */
export async function getGroqClient(): Promise<Groq> {
  if (!groqClient) {
    if (!process.env.GROQ_API_SECRET) {
      throw new Error("GROQ_API_SECRET environment variable is required")
    }
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_SECRET,
    })
  }

  return groqClient
}

/**
 * Retry a Groq API call up to 3 times with exponential backoff
 * @param fn The async function to retry
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @returns The result of the function call
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // If this was the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        break
      }

      // Calculate exponential backoff: 1s, 2s, 4s
      const delayMs = 2 ** attempt * 1000

      console.warn(
        `Groq API call failed (attempt ${attempt + 1}/${maxRetries}). Retrying in ${delayMs}ms...`,
        error instanceof Error ? error.message : String(error),
      )

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  // All retries exhausted
  throw lastError
}
