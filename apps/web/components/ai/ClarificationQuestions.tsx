/**
 * Clarification Questions Component
 *
 * Shows multiple choice questions to clarify user intent before proceeding.
 * Each question has 3 preset options + 1 custom "Other" input.
 * Supports 1-3 questions with navigation between them.
 * Shows a summary before final submission.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface QuestionOption {
  label: string
  description?: string
}

export interface ClarificationQuestion {
  id: string
  question: string
  options: [QuestionOption, QuestionOption, QuestionOption] // Exactly 3 options
}

export interface QuestionAnswer {
  questionId: string
  selectedOption: number | null // 0-2 for preset options, 3 for custom
  customValue?: string
}

interface ClarificationQuestionsProps {
  questions: ClarificationQuestion[]
  onComplete: (answers: QuestionAnswer[]) => void
  onSkipAll?: () => void
}

function getAnswerLabel(answer: QuestionAnswer, question: ClarificationQuestion): string {
  if (answer.selectedOption === null) return "Not answered"
  if (answer.selectedOption === 3) return answer.customValue || "Custom (empty)"
  return question.options[answer.selectedOption].label
}

export function ClarificationQuestions({ questions, onComplete, onSkipAll }: ClarificationQuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<QuestionAnswer[]>(() =>
    questions.map(q => ({ questionId: q.id, selectedOption: null })),
  )
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [showSummary, setShowSummary] = useState(false)
  const customInputRef = useRef<HTMLInputElement>(null)

  const currentQuestion = questions[currentIndex]
  const currentAnswer = answers[currentIndex]
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === questions.length - 1

  // Focus custom input when "Other" is selected
  useEffect(() => {
    if (currentAnswer?.selectedOption === 3 && !showSummary) {
      customInputRef.current?.focus()
    }
  }, [currentAnswer?.selectedOption, showSummary])

  const selectOption = useCallback(
    (optionIndex: number) => {
      setAnswers(prev =>
        prev.map((a, i) =>
          i === currentIndex
            ? {
                ...a,
                selectedOption: optionIndex,
                customValue: optionIndex === 3 ? customInputs[currentQuestion.id] || "" : undefined,
              }
            : a,
        ),
      )
    },
    [currentIndex, currentQuestion?.id, customInputs],
  )

  const updateCustomInput = useCallback(
    (value: string) => {
      setCustomInputs(prev => ({ ...prev, [currentQuestion.id]: value }))
      if (currentAnswer?.selectedOption === 3) {
        setAnswers(prev => prev.map((a, i) => (i === currentIndex ? { ...a, customValue: value } : a)))
      }
    },
    [currentIndex, currentQuestion?.id, currentAnswer?.selectedOption],
  )

  const goToNext = useCallback(() => {
    if (isLastQuestion) {
      setShowSummary(true)
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }, [isLastQuestion])

  const goToPrev = useCallback(() => {
    if (showSummary) {
      setShowSummary(false)
    } else if (!isFirstQuestion) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [isFirstQuestion, showSummary])

  const goToQuestion = useCallback((index: number) => {
    setShowSummary(false)
    setCurrentIndex(index)
  }, [])

  const handleSubmit = useCallback(() => {
    onComplete(answers)
  }, [answers, onComplete])

  // Total steps = questions + summary
  const totalSteps = questions.length + 1
  const currentStep = showSummary ? questions.length : currentIndex

  if (!currentQuestion && !showSummary) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 px-3 py-3 gap-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 pl-1 font-normal text-zinc-900 dark:text-zinc-100 text-sm">
            {showSummary ? "Summary" : "Questions"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex h-full w-full flex-col border-t border-zinc-200 dark:border-zinc-800">
        {/* Question/Summary Area */}
        <div className="flex-1 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
          {showSummary ? (
            /* Summary View */
            <div key="summary" className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 outline-none">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 px-1">Review your answers before submitting:</p>
                {questions.map((question, index) => {
                  const answer = answers[index]
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => goToQuestion(index)}
                      className="flex flex-col gap-0.5 px-2 py-2 rounded-lg text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                    >
                      <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                        Question {index + 1}
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-1">{question.question}</p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                        {getAnswerLabel(answer, question)}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Question View */
            <div key={currentQuestion.id} className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-2 overflow-y-auto p-3 outline-none">
                {/* Question Text */}
                <div className="flex flex-col gap-1 px-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{currentQuestion.question}</p>
                </div>

                {/* Options */}
                <div className="flex flex-col gap-0.5">
                  {currentQuestion.options.map((option, optionIndex) => {
                    const isSelected = currentAnswer?.selectedOption === optionIndex
                    return (
                      <div key={optionIndex} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => selectOption(optionIndex)}
                          className={`group flex cursor-pointer items-start gap-1.5 rounded-lg py-1 pl-2 transition-colors text-left ${
                            isSelected ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          }`}
                        >
                          <div className="flex h-5 items-center">
                            <div
                              className={`size-2.5 border rounded-full transition-colors ${
                                isSelected
                                  ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100"
                                  : "border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-950"
                              }`}
                            />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col pl-1">
                            <p className="text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-100">
                              {option.label}
                            </p>
                            {option.description && (
                              <p className="text-sm leading-5 text-zinc-500 dark:text-zinc-400">{option.description}</p>
                            )}
                          </div>
                        </button>
                      </div>
                    )
                  })}

                  {/* Custom "Other" Option */}
                  <div className="flex flex-col">
                    <div
                      className={`group flex cursor-pointer items-start rounded-lg py-1 pl-2 transition-colors gap-1 ${
                        currentAnswer?.selectedOption === 3 ? "bg-zinc-100 dark:bg-zinc-800" : ""
                      }`}
                    >
                      <div className="flex items-center h-9">
                        <button type="button" onClick={() => selectOption(3)} className="flex h-5 items-center">
                          <div
                            className={`size-2.5 border rounded-full transition-colors ${
                              currentAnswer?.selectedOption === 3
                                ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100"
                                : "border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-950"
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center pl-1">
                        <input
                          ref={customInputRef}
                          type="text"
                          placeholder="Other"
                          value={customInputs[currentQuestion.id] || ""}
                          onChange={e => updateCustomInput(e.target.value)}
                          onFocus={() => selectOption(3)}
                          className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm transition-colors duration-150 ease-in-out placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-600 focus-visible:border-zinc-400 dark:focus-visible:border-zinc-500 focus-visible:outline-none h-9 flex-1 text-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-12 items-center justify-between px-3 py-2">
          {/* Left Button */}
          {isFirstQuestion && !showSummary ? (
            <button
              type="button"
              onClick={onSkipAll}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300"
            >
              Skip all
            </button>
          ) : (
            <button
              type="button"
              onClick={goToPrev}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300"
            >
              Back
            </button>
          )}

          {/* Pagination Dots */}
          <div className="flex items-center gap-0">
            {Array.from({ length: totalSteps }).map((_, index) => {
              const isActive = currentStep === index
              const isSummaryDot = index === questions.length
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => (isSummaryDot ? setShowSummary(true) : goToQuestion(index))}
                  className={`flex cursor-pointer items-center justify-center rounded-full transition-all ${
                    isActive ? "h-4 w-7" : "size-4 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50"
                  }`}
                  aria-label={isSummaryDot ? "Summary" : `Go to question ${index + 1} of ${questions.length}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <div
                    className={`rounded-full bg-zinc-400 dark:bg-zinc-500 transition-all ${
                      isActive ? "h-2 w-5" : "size-2 opacity-50"
                    }`}
                  />
                </button>
              )
            })}
          </div>

          {/* Right Button */}
          {showSummary ? (
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md gap-1.5 h-7 px-4 py-2"
            >
              Submit
            </button>
          ) : (
            <button
              type="button"
              onClick={goToNext}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
