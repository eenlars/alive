"use client"

import { FlaskConical, Image, Layers, MessageCircle, PanelRight, Radio, Settings } from "lucide-react"
import type { RefObject } from "react"
import { PhotoMenu } from "@/components/ui/PhotoMenu"
import type { ChatInputHandle } from "@/features/chat/components/ChatInput/types"
import { isDevelopment, useDebugActions, useDebugView, useSandbox } from "@/lib/stores/debug-store"

interface ChatHeaderProps {
  isSuperadminWorkspace: boolean
  onFeedbackClick: () => void
  onTemplatesClick: () => void
  onSettingsClick: () => void
  showPhotoMenu: boolean
  onPhotoMenuToggle: () => void
  onPhotoMenuClose: () => void
  photoButtonRef: RefObject<HTMLButtonElement | null>
  chatInputRef: RefObject<ChatInputHandle | null>
}

export function ChatHeader({
  isSuperadminWorkspace,
  onFeedbackClick,
  onTemplatesClick,
  onSettingsClick,
  showPhotoMenu,
  onPhotoMenuToggle,
  onPhotoMenuClose,
  photoButtonRef,
  chatInputRef,
}: ChatHeaderProps) {
  const { toggleView, toggleSandbox } = useDebugActions()
  const debugModeEnabled = useDebugView()
  const showSandboxRaw = useSandbox()
  const showSandbox = showSandboxRaw && !isSuperadminWorkspace

  // Shared base styles
  const buttonBase =
    "inline-flex items-center justify-center h-10 rounded-xl active:scale-95 transition-all duration-150 ease-out"

  // Icon-only buttons - square 40x40px
  const iconButtonStyle = `${buttonBase} w-10 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:bg-black/[0.12] dark:active:bg-white/[0.12]`

  // Pill buttons with labels - same height, variable width
  const pillButtonStyle = `${buttonBase} gap-2 px-3.5 text-xs font-medium`

  // Check if any toggle buttons will be visible
  const showDebugToggle = isDevelopment() || isSuperadminWorkspace
  const showPreviewToggle = true // Show for all workspaces - terminal & code for superadmin

  return (
    <div className="h-14 flex-shrink-0 border-b border-black/[0.04] dark:border-white/[0.04]">
      <div className="h-full flex items-center justify-between px-3 mx-auto w-full md:max-w-2xl">
        <div />
        <div className="flex items-center gap-1.5 md:gap-1.5">
          {/* Toggle buttons - hidden on mobile for cleaner UI */}
          {showDebugToggle && (
            <button
              type="button"
              onClick={toggleView}
              className={`hidden md:flex ${pillButtonStyle} ${
                debugModeEnabled
                  ? "text-amber-600 dark:text-amber-400 bg-amber-500/[0.12] hover:bg-amber-500/[0.18]"
                  : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.12] hover:bg-emerald-500/[0.18]"
              }`}
              title={debugModeEnabled ? "Switch to live view" : "Switch to debug view"}
            >
              {debugModeEnabled ? (
                <FlaskConical size={16} strokeWidth={1.75} />
              ) : (
                <Radio size={16} strokeWidth={1.75} />
              )}
              <span>{debugModeEnabled ? "Debug" : "Live"}</span>
            </button>
          )}
          {/* Preview toggle - desktop only (opens side panel, not useful on mobile/tablet) */}
          {showPreviewToggle && (
            <button
              type="button"
              onClick={toggleSandbox}
              className={`items-center justify-center h-10 rounded-xl active:scale-95 transition-all duration-150 ease-out gap-2 px-3.5 text-xs font-medium hidden lg:flex ${
                showSandbox
                  ? "text-purple-600 dark:text-purple-400 bg-purple-500/[0.12] hover:bg-purple-500/[0.18]"
                  : "text-black/40 dark:text-white/40 bg-black/[0.04] dark:bg-white/[0.04] hover:text-black/60 dark:hover:text-white/60 hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"
              }`}
              title={showSandbox ? "Hide preview panel" : "Show preview panel"}
            >
              <PanelRight size={16} strokeWidth={1.75} />
              <span>Preview</span>
            </button>
          )}

          {/* Separator between toggles and icon buttons - only on desktop when toggles are visible */}
          {(showDebugToggle || showPreviewToggle) && (
            <div className="w-px h-5 bg-black/[0.08] dark:bg-white/[0.08] mx-1 hidden md:block" />
          )}

          {/* Feedback - hidden on mobile, available in settings */}
          <button
            type="button"
            onClick={onFeedbackClick}
            className={`hidden md:inline-flex ${iconButtonStyle}`}
            aria-label="Send Feedback"
            title="Send Feedback"
          >
            <MessageCircle size={18} strokeWidth={1.75} />
          </button>

          {/* Templates - always visible, important action */}
          <button
            type="button"
            onClick={onTemplatesClick}
            className={`${iconButtonStyle} size-11 md:size-10`}
            aria-label="Components"
            title="Components"
          >
            <Layers size={20} strokeWidth={1.75} className="md:w-[18px] md:h-[18px]" />
          </button>

          {/* Photos - always visible */}
          <div className="relative">
            <button
              ref={photoButtonRef}
              type="button"
              onClick={onPhotoMenuToggle}
              className={`${iconButtonStyle} size-11 md:size-10`}
              aria-label="Photos"
              title="Photos"
            >
              <Image size={20} strokeWidth={1.75} className="md:w-[18px] md:h-[18px]" />
            </button>
            <PhotoMenu
              isOpen={showPhotoMenu}
              onClose={onPhotoMenuClose}
              onSelectImage={imageKey => chatInputRef.current?.addPhotobookImage(imageKey)}
              triggerRef={photoButtonRef}
            />
          </div>

          {/* Settings - always visible */}
          <button
            type="button"
            onClick={onSettingsClick}
            className={`${iconButtonStyle} size-11 md:size-10 [&>svg]:transition-transform [&>svg]:duration-200 [&>svg]:ease-out hover:[&>svg]:rotate-90`}
            aria-label="Settings"
            data-testid="settings-button"
          >
            <Settings size={20} strokeWidth={1.75} className="md:w-[18px] md:h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
