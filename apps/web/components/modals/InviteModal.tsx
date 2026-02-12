"use client"

import { REFERRAL } from "@webalive/shared"
import { Check, ChevronRight, Heart, Link, Send, X } from "lucide-react"
import { useEffect, useState } from "react"
import useSWR from "swr"
import { Modal } from "@/components/ui/Modal"
import { trackInviteEmailSent, trackInviteLinkCopied, trackInviteModalOpened } from "@/lib/analytics/events"
import type { ReferralData } from "@/lib/api/types"

interface InviteModalProps {
  onClose: () => void
}

// Fetcher that extracts data from standardized response (uses ok: boolean pattern)
const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || "Failed to fetch")
  return json.data
}

export function InviteModal({ onClose }: InviteModalProps) {
  const [email, setEmail] = useState("")
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)

  useEffect(() => {
    trackInviteModalOpened()
  }, [])

  // Fetch referral data from API
  const { data, error, isLoading } = useSWR<ReferralData>("/api/referrals/me", fetcher)

  const inviteLink = data?.inviteLink ?? ""

  const handleCopy = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      trackInviteLinkCopied()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleSendEmail = async () => {
    if (!email.trim() || sending) return
    setSendError(null)
    setSendSuccess(false)
    setSending(true)

    try {
      const res = await fetch("/api/referrals/send-invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const responseData = await res.json()

      if (!res.ok) {
        setSendError(responseData.error || "Failed to send")
      } else {
        trackInviteEmailSent()
        setSendSuccess(true)
        setEmail("")
        setTimeout(() => setSendSuccess(false), 3000)
      }
    } catch {
      setSendError("Network error")
    } finally {
      setSending(false)
    }
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  return (
    <Modal isOpen={true} onClose={onClose} showCloseButton={false} size="sm" className="relative w-[560px]">
      {/* Small close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-10"
        aria-label="Close"
      >
        <X size={16} className="text-black/40 dark:text-white/40" />
      </button>

      {/* Hero section */}
      <div className="flex flex-col items-center px-6 pt-8 pb-6">
        <div className="w-14 h-14 flex items-center justify-center bg-black/5 dark:bg-white/5 mb-4">
          <Heart size={28} className="text-black dark:text-white" />
        </div>
        <h3 className="text-xl font-medium text-black dark:text-white text-center">Invite to get credits</h3>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50 text-center max-w-[320px]">
          Share your invitation link with friends, get {REFERRAL.CREDITS} credits each.
        </p>
      </div>

      {/* Content */}
      <div className="px-6 pb-6 space-y-5">
        {/* Loading state */}
        {isLoading && (
          <div className="text-center text-sm text-black/40 dark:text-white/40 py-4">Loading your invite link...</div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="text-center text-sm text-red-500 py-4">
            Failed to load invite link. Please try again later.
          </div>
        )}

        {/* Loaded state */}
        {data && !isLoading && (
          <>
            {/* Share link section */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-black/50 dark:text-white/50">Share your invitation link</span>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 overflow-hidden">
                  <span className="text-sm text-black/60 dark:text-white/60 truncate">{inviteLink}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Link size={14} />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Email invite section */}
            <div className="space-y-2">
              <label htmlFor="invite-email" className="text-xs font-medium text-black/50 dark:text-white/50">
                Email your invitation
              </label>
              <div className="flex gap-2">
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="flex-1 px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 outline-none focus:border-black/20 dark:focus:border-white/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={!isValidEmail || sending}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 transition-colors text-sm font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black dark:disabled:hover:bg-white"
                >
                  <Send size={14} />
                  {sending ? "Sending..." : sendSuccess ? "Sent!" : "Send"}
                </button>
              </div>
              {sendError && <p className="text-xs text-red-500">{sendError}</p>}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
              <span className="text-xs text-black/40 dark:text-white/40">Invitation history</span>
              <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
            </div>

            {/* Stats card */}
            <div className="flex items-center justify-between p-4 bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
              <div className="flex gap-12">
                <div>
                  <div className="text-lg font-semibold text-black dark:text-white">{data.stats.creditsEarned}</div>
                  <div className="text-xs text-black/40 dark:text-white/40">Credits</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-black dark:text-white">{data.stats.totalReferrals}</div>
                  <div className="text-xs text-black/40 dark:text-white/40">Referrals</div>
                </div>
              </div>
              <div className="w-12 h-12 flex items-center justify-center opacity-10">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  fill="currentColor"
                  className="text-black dark:text-white"
                >
                  <path d="M28 16C28 11.5817 24.4183 8 20 8C15.5817 8 12 11.5817 12 16C12 20.4183 15.5817 24 20 24C24.4183 24 28 20.4183 28 16ZM32 16C32 19.892 30.1451 23.3485 27.2734 25.541C29.2868 26.4307 31.1419 27.6849 32.7285 29.2715C36.1042 32.6471 38 37.2261 38 42C38 43.1046 37.1046 44 36 44C34.8954 44 34 43.1046 34 42C34 38.287 32.5259 34.7251 29.9004 32.0996C27.4388 29.638 24.1539 28.189 20.6934 28.0176L20 28C16.287 28 12.7251 29.4741 10.0996 32.0996C7.4741 34.7251 6 38.287 6 42C6 43.1046 5.10457 44 4 44C2.89543 44 2 43.1046 2 42C2 37.2261 3.89583 32.6471 7.27148 29.2715C8.85764 27.6853 10.7119 26.4307 12.7246 25.541C9.85362 23.3484 8 19.8914 8 16C8 9.37258 13.3726 4 20 4C26.6274 4 32 9.37258 32 16Z" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-black/10 dark:border-white/10">
        {/* TODO: Implement redeem code modal - allows users to enter a referral code they received */}
        <button
          type="button"
          className="text-xs text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 underline transition-colors"
        >
          Redeem code
        </button>
        {/* TODO: Implement invitation history view - shows list of sent invites and their status */}
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-colors"
        >
          Invitation history
          <ChevronRight size={14} />
        </button>
      </div>
    </Modal>
  )
}
