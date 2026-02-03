/**
 * Clarification Questions Preview
 *
 * Preview for ClarificationQuestions component.
 * Shows example questions for design and feature clarification.
 */

"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import {
  type ClarificationQuestion,
  ClarificationQuestions,
  type QuestionAnswer,
} from "@/components/ai/ClarificationQuestions"

const SAMPLE_QUESTIONS: ClarificationQuestion[] = [
  {
    id: "aesthetic",
    question: "What aesthetic direction do you want for the overall design?",
    options: [
      { label: "Minimal & Clean", description: "Lots of whitespace, subtle effects, refined typography" },
      { label: "Bold & Dramatic", description: "High contrast, strong colors, impactful visuals" },
      { label: "Soft & Dreamy", description: "Gentle gradients, blur effects, ethereal feel" },
    ],
  },
  {
    id: "color",
    question: "What color palette feels right for your project?",
    options: [
      { label: "Monochrome", description: "Black, white, and grays only" },
      { label: "Cool Tones", description: "Blues, purples, cyans" },
      { label: "Warm Tones", description: "Oranges, golds, reds" },
    ],
  },
  {
    id: "priority",
    question: "What's the primary goal of this page?",
    options: [
      { label: "Lead Generation", description: "Capture emails and contact info" },
      { label: "Brand Awareness", description: "Tell your story and build trust" },
      { label: "Direct Sales", description: "Showcase products and drive purchases" },
    ],
  },
]

type QuestionCount = 1 | 2 | 3

export function ClarificationQuestionsPreview() {
  const [questionCount, setQuestionCount] = useState<QuestionCount>(2)
  const [answers, setAnswers] = useState<QuestionAnswer[] | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [key, setKey] = useState(0) // For resetting component state

  const activeQuestions = SAMPLE_QUESTIONS.slice(0, questionCount)

  const handleComplete = (completedAnswers: QuestionAnswer[]) => {
    setAnswers(completedAnswers)
    setSkipped(false)
  }

  const handleSkipAll = () => {
    setSkipped(true)
    setAnswers(null)
  }

  const reset = () => {
    setAnswers(null)
    setSkipped(false)
    setKey(k => k + 1)
  }

  const formatAnswer = (answer: QuestionAnswer, question: ClarificationQuestion) => {
    if (answer.selectedOption === null) return "Not answered"
    if (answer.selectedOption === 3) return `Custom: "${answer.customValue || ""}"`
    return question.options[answer.selectedOption].label
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">ClarificationQuestions</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Multiple choice questions to clarify user intent. 3 preset options + 1 custom input per question.
        </p>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
        {/* Component Preview */}
        <div className="flex-1 md:max-w-xl">
          {answers || skipped ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl">
              <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 px-3 py-3">
                <span className="pl-1 font-normal text-zinc-900 dark:text-zinc-100 text-sm">
                  {skipped ? "Questions Skipped" : "Answers Submitted"}
                </span>
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                {skipped ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">User chose to skip all questions.</p>
                ) : (
                  <div className="space-y-3">
                    {answers?.map((answer, i) => (
                      <div key={answer.questionId}>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                          Question {i + 1}
                        </p>
                        <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-0.5">
                          {formatAnswer(answer, activeQuestions[i])}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Show Again
                </button>
              </div>
            </div>
          ) : (
            <ClarificationQuestions
              key={key}
              questions={activeQuestions}
              onComplete={handleComplete}
              onSkipAll={handleSkipAll}
            />
          )}
        </div>

        {/* Controls */}
        <div className="w-full md:w-56 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Number of Questions
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {([1, 2, 3] as const).map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setQuestionCount(count)
                    reset()
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    questionCount === count
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Sample Questions
            </h3>
            <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              {activeQuestions.map((q, i) => (
                <li key={q.id} className="truncate">
                  {i + 1}. {q.question.substring(0, 30)}...
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
