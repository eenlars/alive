"use client"

import { Check, Loader2, Sparkles } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useAuth } from "@/features/deployment/hooks/useAuth"

interface FeedbackModalProps {
  onClose: () => void
  workspace?: string
  conversationId?: string
}

export function FeedbackModal({ onClose, workspace, conversationId }: FeedbackModalProps) {
  const titleId = useId()
  const textareaId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { user } = useAuth()
  const [feedback, setFeedback] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Focus textarea on mount and handle Escape key
  useEffect(() => {
    textareaRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feedback,
          email: user?.email,
          workspace,
          conversationId,
          userAgent: navigator.userAgent,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to submit feedback" }))
        throw new Error(errorData.message || "Failed to submit feedback")
      }

      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      console.error("Feedback submission error:", err)
      setError(err instanceof Error ? err.message : "Failed to submit feedback")
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="bg-white dark:bg-neutral-900 rounded-2xl p-8 max-w-sm w-full shadow-xl ring-1 ring-black/[0.08] dark:ring-white/[0.08] animate-in fade-in-0 zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
          role="document"
        >
          <div className="size-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="size-6 text-green-500" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-medium text-black dark:text-white mb-1 text-center">Thank you!</h3>
          <p className="text-sm text-black/50 dark:text-white/50 text-center">Your feedback helps us improve</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl p-6 max-w-sm w-full shadow-xl ring-1 ring-black/[0.08] dark:ring-white/[0.08] animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        role="document"
      >
        <div className="size-12 bg-black/[0.04] dark:bg-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="size-6 text-black/70 dark:text-white/70" />
        </div>
        <h3 id={titleId} className="text-lg font-medium text-black dark:text-white mb-1 text-center">
          Send Feedback
        </h3>
        <p className="text-sm text-black/40 dark:text-white/40 text-center mb-5">Help us make this better</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            ref={textareaRef}
            id={textareaId}
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
            className="w-full px-4 py-3 bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-sm leading-relaxed text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-black/[0.12] dark:focus:ring-white/[0.12] focus:border-transparent transition-all duration-150 resize-none"
            required
            disabled={loading}
            autoComplete="off"
            data-1p-ignore
          />

          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.09] active:bg-black/[0.10] dark:active:bg-white/[0.12] text-black/70 dark:text-white/70 rounded-xl transition-colors duration-150 font-medium text-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 h-11 bg-black dark:bg-white text-white dark:text-black hover:brightness-[0.85] active:brightness-75 rounded-xl transition-[filter] duration-150 font-medium text-sm disabled:opacity-30 disabled:hover:brightness-100 flex items-center justify-center gap-2"
              disabled={loading || !feedback.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending
                </>
              ) : (
                "Send"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
