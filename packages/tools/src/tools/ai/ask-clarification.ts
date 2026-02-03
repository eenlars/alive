/**
 * Ask Clarification Tool
 *
 * Presents multiple choice questions to clarify user intent before proceeding.
 * Use this when a user's request is ambiguous or needs more context.
 *
 * The tool returns structured data that the frontend renders as an interactive
 * questionnaire. User answers are sent back to Claude for processing.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

/**
 * Schema for a single clarification question option
 */
const questionOptionSchema = z.object({
  label: z.string().describe("Short label for the option (e.g., 'Minimal & Clean')"),
  description: z.string().optional().describe("Optional longer description explaining the option"),
})

/**
 * Schema for a single clarification question
 */
const clarificationQuestionSchema = z.object({
  id: z.string().describe("Unique identifier for this question (e.g., 'aesthetic', 'color-palette')"),
  question: z.string().describe("The question to ask the user"),
  options: z
    .array(questionOptionSchema)
    .length(3)
    .describe(
      "Exactly 3 options for the user to choose from. A 4th 'Other' option with custom input is added automatically.",
    ),
})

export const askClarificationParamsSchema = {
  questions: z.array(clarificationQuestionSchema).min(1).max(3).describe("1-3 clarification questions to ask the user"),
  context: z.string().optional().describe("Optional context about why these questions are being asked"),
}

export type QuestionOption = z.infer<typeof questionOptionSchema>
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>

export interface AskClarificationParams {
  questions: ClarificationQuestion[]
  context?: string
}

export interface AskClarificationResult {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
  [key: string]: unknown // Required by SDK tool result type
}

/**
 * Ask clarification questions to the user.
 *
 * The tool returns JSON that the frontend renders as an interactive questionnaire.
 * When the user submits their answers, they are sent back to Claude as a follow-up message.
 */
export async function askClarification(params: AskClarificationParams): Promise<AskClarificationResult> {
  try {
    const { questions, context } = params

    // Validate questions
    if (questions.length === 0) {
      return {
        content: [{ type: "text", text: "Error: At least one question is required" }],
        isError: true,
      }
    }

    if (questions.length > 3) {
      return {
        content: [{ type: "text", text: "Error: Maximum 3 questions allowed" }],
        isError: true,
      }
    }

    // Validate each question has exactly 3 options
    for (const q of questions) {
      if (q.options.length !== 3) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Question "${q.id}" must have exactly 3 options (got ${q.options.length})`,
            },
          ],
          isError: true,
        }
      }
    }

    // Return structured data for the frontend to render
    const responseData = {
      type: "clarification_questions",
      questions: questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options.map(opt => ({
          label: opt.label,
          description: opt.description,
        })),
      })),
      context,
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
          text: `Error creating clarification questions: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}

export const askClarificationTool = tool(
  "ask_clarification",
  `Ask the user clarification questions when their request is ambiguous or needs more context.

Use this tool when:
- The user's request could be interpreted multiple ways
- You need to understand preferences before starting work (design style, technical approach, etc.)
- Planning a complex task that has multiple valid approaches
- The user asks for something that requires choosing between options

The tool presents 1-3 multiple choice questions, each with 3 preset options plus a custom "Other" input.
After the user answers, their responses will be sent back to you to continue the conversation.

Example use cases:
- "Build me a website" → Ask about style (minimal/bold/playful), color palette, and purpose
- "Add authentication" → Ask about method (OAuth/password/magic link) and session handling
- "Optimize performance" → Ask about priority (load time/bundle size/runtime) and scope`,
  askClarificationParamsSchema,
  async args => {
    return askClarification(args)
  },
)
