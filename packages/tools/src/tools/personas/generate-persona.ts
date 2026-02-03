import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { askAI } from "../../lib/ask-ai.js"

async function getPersonaMarkdown(
  taskQuery: string,
  stylePreferences: string,
  extraContext: string | undefined,
): Promise<string> {
  const prompt = `Find the ideal famous person to approach this task. Not someone fictional - a real, recognizable person who embodies what's needed.

**The Task:** ${taskQuery}

**Style Preferences:** ${stylePreferences}

${extraContext ? `**Project Context:** ${extraContext}` : ""}

Choose a famous person (real, known to history or current times) who:
- Would approach this task exactly as needed
- Has a proven track record of creating/building excellently
- Embodies the desired style and qualities

This can be anyone from any field - designers, engineers (backend, frontend, full-stack), artists, writers, executives, scientists, entrepreneurs, craftspeople, etc. Don't be biased towards specific people - pick whoever actually fits best.

Format the response as Markdown with these sections:
# [Famous Person Name]
> [A quote that captures their philosophy]

## Why Them?
[Why this person is perfect for this specific task]

## Qualities & Skills
- [Relevant quality/skill]
- [Relevant quality/skill]
...

## How They Approach Problems
[Describe how they typically tackle challenges]

## What Makes Them Different
[What sets them apart from everyone else in their field]

## What They're Good At
- [Specific thing they excel at]
- [Specific thing they excel at]
...

## How They Feel About Things
[Their intuition and instincts about what works]

## What They Value
- [Core value]
- [Core value]
...

## How They Check Their Work
### Standards They Hold
- [Standard they uphold]
- [Standard they uphold]
...

### Their Process
[How they evaluate if something is good]

### Red Flags
- [What they would immediately reject as not good enough]
- [What they would immediately reject as not good enough]
...

IMPORTANT: Only output the markdown. Do not use any tools. Just respond with the persona description.`

  return askAI({ question: prompt })
}

export const generatePersonaParamsSchema = {
  query: z.string().describe("What would the best person in this world do? (the task or role you need)"),
  style_preferences: z.string().describe("What style and qualities should the approach have?"),
  extra_things_to_know: z.string().optional().describe("Extra context about the website or project"),
}

export type GeneratePersonaParams = {
  query: string
  style_preferences: string
  extra_things_to_know?: string
}

export type GeneratePersonaResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

export async function generatePersona(params: GeneratePersonaParams): Promise<GeneratePersonaResult> {
  try {
    const personaMarkdown = await getPersonaMarkdown(
      params.query,
      params.style_preferences,
      params.extra_things_to_know,
    )

    return {
      content: [
        {
          type: "text",
          text: personaMarkdown,
        },
      ],
      isError: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    let userMessage = "Something went wrong while generating the persona."
    if (errorMessage.includes("No response")) {
      userMessage = "Claude didn't respond. This sometimes happens - feel free to try again."
    } else if (errorMessage.includes("rate") || errorMessage.includes("limit")) {
      userMessage = "Rate limit reached. Please try again in a moment."
    }

    return {
      content: [
        {
          type: "text",
          text: `${userMessage}\n\nDetails: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}

export const generatePersonaTool = tool(
  "generate_persona",
  "Generates a famous person persona who would approach your task ideally. Not fictional - a real person known for excelling at what you need. Returns their qualities, approach to problems, values, intuition, and standards for quality. Perfect for understanding how an excellent person would tackle your specific challenge.",
  generatePersonaParamsSchema,
  async args => {
    return generatePersona(args)
  },
)
