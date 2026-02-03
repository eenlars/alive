/**
 * Clarification Questions Output
 *
 * Renders the ask_clarification tool result as an interactive questionnaire.
 * When the user submits answers, they are sent back to Claude for processing.
 */

"use client"

import { useCallback, useState } from "react"
import {
  type ClarificationQuestion,
  ClarificationQuestions,
  type QuestionAnswer,
} from "@/components/ai/ClarificationQuestions"
import type { ToolResultRendererProps } from "@/lib/tools/tool-registry"

/**
 * Expected data format from the ask_clarification tool
 */
interface ClarificationQuestionsData {
  type: "clarification_questions"
  questions: Array<{
    id: string
    question: string
    options: Array<{
      label: string
      description?: string
    }>
  }>
  context?: string
}

/**
 * Type guard to validate the tool output
 */
export function validateClarificationQuestions(data: unknown): data is ClarificationQuestionsData {
  if (!data || typeof data !== "object") return false
  const d = data as Record<string, unknown>

  if (d.type !== "clarification_questions") return false
  if (!Array.isArray(d.questions)) return false
  if (d.questions.length === 0 || d.questions.length > 3) return false

  for (const q of d.questions) {
    if (typeof q !== "object" || !q) return false
    const question = q as Record<string, unknown>
    if (typeof question.id !== "string") return false
    if (typeof question.question !== "string") return false
    if (!Array.isArray(question.options) || question.options.length !== 3) return false

    for (const opt of question.options) {
      if (typeof opt !== "object" || !opt) return false
      const option = opt as Record<string, unknown>
      if (typeof option.label !== "string") return false
    }
  }

  return true
}

/**
 * Format the answers for display and submission to Claude
 */
function formatAnswersForSubmission(
  answers: QuestionAnswer[],
  questions: ClarificationQuestionsData["questions"],
): string {
  const lines: string[] = ["Here are my answers to your clarification questions:", ""]

  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i]
    const question = questions[i]

    let answerText: string
    if (answer.selectedOption === null) {
      answerText = "(skipped)"
    } else if (answer.selectedOption === 3) {
      answerText = answer.customValue || "(empty custom answer)"
    } else {
      answerText = question.options[answer.selectedOption].label
    }

    lines.push(`**${question.question}**`)
    lines.push(`→ ${answerText}`)
    lines.push("")
  }

  return lines.join("\n")
}

interface ClarificationQuestionsOutputProps extends ToolResultRendererProps<ClarificationQuestionsData> {
  onSubmitAnswer?: (message: string) => void
}

export function ClarificationQuestionsOutput({ data, onSubmitAnswer }: ClarificationQuestionsOutputProps) {
  const [submitted, setSubmitted] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [submittedAnswers, setSubmittedAnswers] = useState<QuestionAnswer[] | null>(null)

  // Convert data format to component format
  const questions: ClarificationQuestion[] = data.questions.map(q => ({
    id: q.id,
    question: q.question,
    options: q.options.slice(0, 3) as [
      { label: string; description?: string },
      { label: string; description?: string },
      { label: string; description?: string },
    ],
  }))

  const handleComplete = useCallback(
    (answers: QuestionAnswer[]) => {
      setSubmittedAnswers(answers)
      setSubmitted(true)

      // Format answers and send to Claude
      const message = formatAnswersForSubmission(answers, data.questions)
      onSubmitAnswer?.(message)
    },
    [data.questions, onSubmitAnswer],
  )

  const handleSkipAll = useCallback(() => {
    setSkipped(true)
    onSubmitAnswer?.("I'd like to skip these questions and let you decide.")
  }, [onSubmitAnswer])

  // Show completion state
  if (submitted || skipped) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
        <p className="text-xs text-black/50 dark:text-white/50">
          {skipped ? "Questions skipped" : "Answers submitted"}
        </p>
        {submittedAnswers && !skipped && (
          <div className="mt-2 space-y-1">
            {submittedAnswers.map((answer, i) => {
              const question = data.questions[i]
              let answerText: string
              if (answer.selectedOption === null) {
                answerText = "(skipped)"
              } else if (answer.selectedOption === 3) {
                answerText = answer.customValue || "(empty)"
              } else {
                answerText = question.options[answer.selectedOption].label
              }
              return (
                <div key={answer.questionId} className="text-xs">
                  <span className="text-black/40 dark:text-white/40">{i + 1}. </span>
                  <span className="text-black/70 dark:text-white/70">{answerText}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2">
      {data.context && <p className="text-xs text-black/50 dark:text-white/50 mb-2 px-1">{data.context}</p>}
      <ClarificationQuestions questions={questions} onComplete={handleComplete} onSkipAll={handleSkipAll} />
    </div>
  )
}
