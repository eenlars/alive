/**
 * EmailDraftCard Component
 *
 * Clean email compose UI. Claude drafts, user sends.
 */

"use client"

import { AlertCircle, AlertTriangle, Check, Loader2, Save, Send, X } from "lucide-react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { EmailDraft, EmailDraftOutputProps } from "./types"

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function EmailField({
  label,
  emails,
  onChange,
  placeholder = "Add recipient...",
}: {
  label: string
  emails: string[]
  onChange: (emails: string[]) => void
  placeholder?: string
}) {
  const [inputValue, setInputValue] = useState("")

  const addEmail = () => {
    const email = inputValue.trim()
    if (!email || !isValidEmail(email) || emails.includes(email)) return false
    onChange([...emails, email])
    setInputValue("")
    return true
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addEmail()
    } else if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      onChange(emails.slice(0, -1))
    }
  }

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
      <span className="text-xs text-zinc-400 w-6">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1.5">
        {emails.map(email => (
          <span
            key={email}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded"
          >
            {email}
            <button
              type="button"
              onClick={() => onChange(emails.filter(e => e !== email))}
              className="hover:text-red-500"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="email"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addEmail()}
          placeholder={emails.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 outline-none"
        />
      </div>
    </div>
  )
}

function GmailWarning() {
  return (
    <div className="flex items-center gap-2 p-2 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>Gmail not connected.</span>
      <a href="/chat?settings=integrations" className="underline hover:no-underline">
        Connect
      </a>
    </div>
  )
}

export function EmailDraftCard({
  draft,
  onSend,
  onSaveDraft,
  onEdit: _onEdit,
  onDraftChange,
  actionsDisabled,
  isGmailConnected = true,
}: EmailDraftOutputProps & {
  onDraftChange?: (draft: EmailDraft) => void
  isGmailConnected?: boolean
}) {
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedDraft, setEditedDraft] = useState<EmailDraft>(draft)
  const [showCcBcc, setShowCcBcc] = useState(
    Boolean((draft.cc && draft.cc.length > 0) || (draft.bcc && draft.bcc.length > 0)),
  )
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.style.height = "auto"
      bodyRef.current.style.height = `${Math.max(120, bodyRef.current.scrollHeight)}px`
    }
  }, [editedDraft.body])

  const handleSend = async () => {
    if (!onSend || sending) return
    setSending(true)
    try {
      await onSend(editedDraft)
    } finally {
      setSending(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!onSaveDraft || saving) return
    setSaving(true)
    try {
      await onSaveDraft(editedDraft)
      onDraftChange?.(editedDraft)
    } finally {
      setSaving(false)
    }
  }

  const updateField = <K extends keyof EmailDraft>(field: K, value: EmailDraft[K]) => {
    setEditedDraft(prev => ({ ...prev, [field]: value }))
  }

  const isSent = draft.status === "sent"
  const isError = draft.status === "error"
  const isSending = draft.status === "sending" || sending
  const canAct = !isSent && !isSending && !actionsDisabled

  // Sent state - minimal
  if (isSent) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg">
        <Check className="w-4 h-4" />
        <span>Email sent to {editedDraft.to.join(", ")}</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Gmail warning */}
      {!isGmailConnected && canAct && (
        <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
          <GmailWarning />
        </div>
      )}

      {/* Recipients */}
      <div className="px-3 pt-2">
        <EmailField label="To" emails={editedDraft.to} onChange={emails => updateField("to", emails)} />

        {showCcBcc ? (
          <>
            <EmailField
              label="Cc"
              emails={editedDraft.cc || []}
              onChange={emails => updateField("cc", emails.length ? emails : undefined)}
              placeholder=""
            />
            <EmailField
              label="Bcc"
              emails={editedDraft.bcc || []}
              onChange={emails => updateField("bcc", emails.length ? emails : undefined)}
              placeholder=""
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowCcBcc(true)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 py-1"
          >
            + Cc/Bcc
          </button>
        )}
      </div>

      {/* Subject */}
      <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <input
          type="text"
          value={editedDraft.subject}
          onChange={e => updateField("subject", e.target.value)}
          placeholder="Subject"
          className="w-full text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-transparent outline-none placeholder-zinc-400"
        />
      </div>

      {/* Body */}
      <div className="px-3 py-3">
        <textarea
          ref={bodyRef}
          value={editedDraft.body}
          onChange={e => updateField("body", e.target.value)}
          placeholder="Write your message..."
          className="w-full text-sm text-zinc-700 dark:text-zinc-300 bg-transparent outline-none resize-none placeholder-zinc-400 leading-relaxed"
          style={{ minHeight: "120px" }}
        />
      </div>

      {/* Error */}
      {isError && draft.error && (
        <div className="mx-3 mb-3 flex items-start gap-2 p-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{draft.error}</span>
        </div>
      )}

      {/* Actions */}
      {canAct && (
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800">
          <Button
            onClick={handleSend}
            disabled={isSending || !onSend || !isGmailConnected || editedDraft.to.length === 0}
            size="sm"
            className="gap-1.5"
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </Button>
          <Button
            onClick={handleSaveDraft}
            disabled={saving || !onSaveDraft || !isGmailConnected}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Draft
          </Button>
        </div>
      )}
    </div>
  )
}

export default EmailDraftCard
