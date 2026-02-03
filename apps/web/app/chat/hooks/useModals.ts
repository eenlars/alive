"use client"

import { useCallback, useMemo, useState } from "react"

type SettingsReason = "manual" | "error" | "websites" | null

interface ModalState {
  feedback: boolean
  invite: boolean
  settings: SettingsReason
  templates: boolean
  photoMenu: boolean
  mobilePreview: boolean
}

interface ModalActions {
  openFeedback: () => void
  closeFeedback: () => void
  openInvite: () => void
  closeInvite: () => void
  openSettings: (reason?: SettingsReason) => void
  closeSettings: () => void
  openTemplates: () => void
  closeTemplates: () => void
  togglePhotoMenu: () => void
  closePhotoMenu: () => void
  openMobilePreview: () => void
  closeMobilePreview: () => void
}

/**
 * Hook to manage all modal visibility state in one place.
 * Reduces 6 separate useState calls to 1 consolidated state.
 */
export function useModals(): ModalState & ModalActions {
  const [state, setState] = useState<ModalState>({
    feedback: false,
    invite: false,
    settings: null,
    templates: false,
    photoMenu: false,
    mobilePreview: false,
  })

  const openFeedback = useCallback(() => setState(s => ({ ...s, feedback: true })), [])
  const closeFeedback = useCallback(() => setState(s => ({ ...s, feedback: false })), [])

  const openInvite = useCallback(() => setState(s => ({ ...s, invite: true })), [])
  const closeInvite = useCallback(() => setState(s => ({ ...s, invite: false })), [])

  const openSettings = useCallback(
    (reason: SettingsReason = "manual") => setState(s => ({ ...s, settings: reason })),
    [],
  )
  const closeSettings = useCallback(() => setState(s => ({ ...s, settings: null })), [])

  const openTemplates = useCallback(() => setState(s => ({ ...s, templates: true })), [])
  const closeTemplates = useCallback(() => setState(s => ({ ...s, templates: false })), [])

  const togglePhotoMenu = useCallback(() => setState(s => ({ ...s, photoMenu: !s.photoMenu })), [])
  const closePhotoMenu = useCallback(() => setState(s => ({ ...s, photoMenu: false })), [])

  const openMobilePreview = useCallback(() => setState(s => ({ ...s, mobilePreview: true })), [])
  const closeMobilePreview = useCallback(() => setState(s => ({ ...s, mobilePreview: false })), [])

  return useMemo(
    () => ({
      ...state,
      openFeedback,
      closeFeedback,
      openInvite,
      closeInvite,
      openSettings,
      closeSettings,
      openTemplates,
      closeTemplates,
      togglePhotoMenu,
      closePhotoMenu,
      openMobilePreview,
      closeMobilePreview,
    }),
    [
      state,
      openFeedback,
      closeFeedback,
      openInvite,
      closeInvite,
      openSettings,
      closeSettings,
      openTemplates,
      closeTemplates,
      togglePhotoMenu,
      closePhotoMenu,
      openMobilePreview,
      closeMobilePreview,
    ],
  )
}
