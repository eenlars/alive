/**
 * Mail Send Preview
 *
 * Preview for EmailDraftCard component with inline editing.
 */

"use client"

import { RefreshCw, RotateCcw } from "lucide-react"
import { useState } from "react"
import { type EmailDraft, EmailDraftCard, FAKE_EMAIL_DRAFTS } from "@/components/email"
import { useIntegrations } from "@/hooks/use-integrations"

export function MailSendPreview() {
  const [draft, setDraft] = useState<EmailDraft>(FAKE_EMAIL_DRAFTS[0])
  const [simulateGmailConnected, setSimulateGmailConnected] = useState(true)
  const { integrations, loading: integrationsLoading, refetch: refetchIntegrations } = useIntegrations()

  const realGmailConnected = integrations.find(i => i.provider_key === "google")?.is_connected ?? false

  const handleSend = async () => {
    setDraft(prev => ({ ...prev, status: "sending" }))
    await new Promise(resolve => setTimeout(resolve, 1500))
    setDraft(prev => ({ ...prev, status: "sent" }))
  }

  const handleSaveDraft = async () => {
    await new Promise(resolve => setTimeout(resolve, 800))
    setDraft(prev => ({ ...prev, status: "saved" }))
  }

  const handleEdit = (d: EmailDraft) => {
    console.log("Draft edited:", d)
  }

  const handleDraftChange = (updatedDraft: EmailDraft) => {
    setDraft(updatedDraft)
  }

  const resetDraft = () => {
    setDraft({ ...FAKE_EMAIL_DRAFTS[0], status: "draft" })
  }

  const setStatus = (status: EmailDraft["status"]) => {
    setDraft(prev => ({
      ...prev,
      status,
      error: status === "error" ? "SMTP connection failed: Unable to reach mail server" : undefined,
    }))
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">EmailDraftCard</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Inline editing with contentEditable. Click Edit, then click text to modify.
        </p>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
        {/* Email Draft */}
        <div className="flex-1 md:max-w-xl">
          <EmailDraftCard
            draft={draft}
            onSend={handleSend}
            onSaveDraft={handleSaveDraft}
            onEdit={handleEdit}
            onDraftChange={handleDraftChange}
            isGmailConnected={simulateGmailConnected}
          />
        </div>

        {/* Controls */}
        <div className="w-full md:w-56 space-y-4">
          {/* Status */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Status
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(["draft", "saved", "sending", "sent", "error"] as const).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatus(status)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    draft.status === status
                      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Gmail Connection */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Gmail</h3>

            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-zinc-400">Real:</span>
              <div className="flex items-center gap-1">
                {integrationsLoading ? (
                  <span className="text-zinc-400">...</span>
                ) : (
                  <span className={realGmailConnected ? "text-emerald-600" : "text-amber-600"}>
                    {realGmailConnected ? "on" : "off"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => refetchIntegrations()}
                  className="p-0.5 text-zinc-400 hover:text-zinc-600"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Simulate:</span>
              <button
                type="button"
                onClick={() => setSimulateGmailConnected(!simulateGmailConnected)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  simulateGmailConnected ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    simulateGmailConnected ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Reset */}
          <button
            type="button"
            onClick={resetDraft}
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
