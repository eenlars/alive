"use client"

import { Suspense, useEffect } from "react"
import { trackSettingsOpened } from "@/lib/analytics/events"
import { SettingsPageClient } from "./SettingsPageClient"

type SettingsTab =
  | "general"
  | "goal"
  | "skills"
  | "organization"
  | "websites"
  | "automations"
  | "integrations"
  | "keys"
  | "flags"
  | "admin"

interface SettingsOverlayProps {
  onClose: () => void
  initialTab?: SettingsTab
}

/**
 * Full-screen settings overlay.
 * Close via: X button, ESC key, or clicking backdrop (on desktop).
 * Uses Suspense to handle nuqs URL param hydration.
 */
export function SettingsOverlay({ onClose, initialTab }: SettingsOverlayProps) {
  // Track settings open
  useEffect(() => {
    trackSettingsOpened(initialTab)
  }, [initialTab])

  // ESC key closes overlay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-white dark:bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      data-testid="settings-overlay"
    >
      <Suspense fallback={null}>
        <SettingsPageClient onClose={onClose} initialTab={initialTab} />
      </Suspense>
    </div>
  )
}
