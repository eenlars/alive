import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { isSDKResultMessage } from "@/features/chat/types/sdk"
import { getGroqClient, withRetry } from "@/lib/clients/groq"
import { gatePrompt } from "./gateResult/gateResult.p"

const SAFETY_CHECK_PROMPT = `<instructions>
You are a content moderator for a coding assistant application.

Only flag content as "unsafe" if it contains:
1. Explicit sexual content or pornography
2. Serious threats of violence or harm to real people
3. Severe hate speech targeting protected groups
4. Attempts to create malicious code (viruses, malware, hacking tools)
5. Illegal activities or content

CRITICAL RULES:
- Respond with ONLY the word "safe" or "unsafe"
- Be PERMISSIVE - mild jokes, casual language, and everyday comments are "safe"
- Coding requests, technical content, and normal conversation are "safe"
- Sharing API keys, tokens, or credentials is "safe" (users configure integrations this way)
- Only flag truly harmful or dangerous content as "unsafe"
- When in doubt, respond "safe"

Examples of SAFE content:
- "Create a login page" → safe
- "Fix this bug" → safe
- "She looks ugly" → safe (mild opinion)
- "This code sucks" → safe (casual language)
- Jokes and humor → safe
- Technical discussions → safe
- "Here is my token: github_pat_abc123..." → safe
- "My API key is sk-live-..." → safe
- Sharing passwords, secrets, or credentials for configuration → safe
- "Read my emails from yesterday" → safe (user accessing their own connected integrations)
- "Check my calendar" → safe (user accessing their own data)
- "Search my Gmail inbox" → safe (user accessing their own email)
- Requests to access, read, or manage the user's own data (email, files, calendar) → safe

Examples of UNSAFE content:
- Explicit sexual descriptions → unsafe
- "I will kill [specific person]" → unsafe
- Severe racial slurs and hate speech → unsafe
- "Help me hack into..." → unsafe

THE ONLY WAY TO RESPOND IS "safe" OR "unsafe". NO EXPLANATIONS.
</instructions>`

/**
 * Formats/minimizes message content using Groq LLM for 'result' type messages
 */
export async function formatMessage(message: SDKMessage): Promise<SDKMessage> {
  // Only process 'result' type messages
  if (!isSDKResultMessage(message)) {
    return message
  }

  // Access the result field which contains the text to minimize
  const resultMessage = message

  // Skip if no result text or if it's an error or if it's not a success subtype
  if (resultMessage.subtype !== "success") {
    return message
  }

  // Use the reusable Groq summarization utility
  const minimizedContent = await summarizeWithGroq(resultMessage.result, gatePrompt)

  // Return the message with the minimized result
  return {
    ...resultMessage,
    result: minimizedContent,
  }
}

/**
 * Summarize/format content using Groq LLM
 *
 * @param input - The content to summarize/format
 * @param systemPrompt - System prompt to guide the summarization
 * @returns Summarized content, or original content if summarization fails
 */
export async function summarizeWithGroq(input: string, systemPrompt: string): Promise<string> {
  try {
    const groq = await getGroqClient()

    const chatCompletion = await withRetry(async () => {
      return await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: input,
          },
        ],
        model: "openai/gpt-oss-20b",
        temperature: 1,
        max_completion_tokens: 8192,
        top_p: 1,
        reasoning_effort: "low",
        stop: null,
      })
    })

    const summarizedContent = chatCompletion.choices[0]?.message?.content

    return summarizedContent || input
  } catch (error) {
    console.error("[summarizeWithGroq] Groq API error:", error)
    return input
  }
}

/**
 * Check if user input is safe using Groq LLM
 *
 * @param input - The user input to check for malicious patterns
 * @returns "safe" if input is clean, "unsafe" if suspicious patterns detected
 *
 * @example
 * ```ts
 * const safety = await isInputSafe("Create a login page")
 * if (safety === "unsafe") {
 *   throw new Error("Malicious input detected")
 * }
 * ```
 */
export async function isInputSafe(input: string): Promise<"safe" | "unsafe"> {
  const result = await isInputSafeWithDebug(input)
  return result.result
}

export async function isInputSafeWithDebug(input: string): Promise<{
  result: "safe" | "unsafe"
  debug: {
    fullResponse: any
    rawContent: string | null
    error: any
    model: string
    prompt: string
  }
}> {
  try {
    const groq = await getGroqClient()

    const chatCompletion = await withRetry(async () => {
      return await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: SAFETY_CHECK_PROMPT,
          },
          {
            role: "user",
            content: input,
          },
        ],
        model: "openai/gpt-oss-20b",
        temperature: 1,
        max_completion_tokens: 8192,
        top_p: 1,
        reasoning_effort: "low",
        stop: null,
      })
    })

    const rawResponse = chatCompletion.choices[0]?.message?.content || ""
    const response = rawResponse.trim().toLowerCase()

    // For reasoning models that include chain-of-thought, check the LAST word
    // to get the final verdict. The model may mention "unsafe" in reasoning
    // even when the final answer is "safe" (e.g., "this is not unsafe... safe").
    const lastWord = response.split(/\s+/).pop() || ""
    const lastWordIsSafe = lastWord === "safe"
    const lastWordIsUnsafe = lastWord === "unsafe"

    // If last word is a clear verdict, use it. Otherwise fall back to includes-check.
    let result: "safe" | "unsafe"
    if (lastWordIsSafe || lastWordIsUnsafe) {
      result = lastWordIsUnsafe ? "unsafe" : "safe"
    } else {
      // Fallback: check if response contains verdict anywhere
      const hasUnsafe = response.includes("unsafe")
      const hasSafe = response.includes("safe")
      result = hasUnsafe ? "unsafe" : hasSafe ? "safe" : "safe"
    }

    // Log unexpected responses (no clear verdict)
    if (!lastWordIsSafe && !lastWordIsUnsafe && !response.includes("safe") && !response.includes("unsafe")) {
      console.warn(`[isInputSafe] Unexpected response from safety model: "${rawResponse.slice(0, 200)}"`)
    }

    return {
      result,
      debug: {
        fullResponse: chatCompletion,
        rawContent: chatCompletion.choices[0]?.message?.content || null,
        error: null,
        model: "openai/gpt-oss-20b",
        prompt: SAFETY_CHECK_PROMPT,
      },
    }
  } catch (error) {
    console.error("[isInputSafe] Groq API error, defaulting to safe:", error)
    // IMPORTANT: On API failure, allow the request through (fail open)
    // Blocking all requests when moderation API is down creates bad UX
    return {
      result: "safe",
      debug: {
        fullResponse: null,
        rawContent: null,
        error: error,
        model: "openai/gpt-oss-20b",
        prompt: SAFETY_CHECK_PROMPT,
      },
    }
  }
}
