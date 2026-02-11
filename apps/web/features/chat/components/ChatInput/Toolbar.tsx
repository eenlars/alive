"use client"

import { Camera, ClipboardList, Copy, FileText, Globe, MousePointer2, User } from "lucide-react"
import type { RefObject } from "react"
import { useState } from "react"
import toast from "react-hot-toast"
import { usePanelContext } from "@/features/chat/lib/sandbox-context"
import { formatMessagesAsText } from "@/features/chat/utils/format-messages"
import { useDexieMessageStore } from "@/lib/db/dexieMessageStore"
import { useTabMessages } from "@/lib/db/useTabMessages"
import { useAllSkills, useSkillsLoading } from "@/lib/providers/SkillsStoreProvider"
import { useSandbox, useSandboxMinimized } from "@/lib/stores/debug-store"
import { usePlanMode, usePlanModeActions } from "@/lib/stores/planModeStore"
import type { Skill } from "@/lib/stores/skillsStore"
import { useChatInput } from "./ChatInputContext"

interface ToolbarProps {
  fileInputRef: RefObject<HTMLInputElement | null>
  onOpenTemplates?: () => void
  /** @deprecated Use onAddSkill instead */
  onAddUserPrompt?: (promptType: string, data: any, displayName: string, userFacingDescription?: string) => void
  onAddSkill?: (
    skillId: string,
    displayName: string,
    description: string,
    prompt: string,
    source: "global" | "user" | "project",
  ) => void
}

export function Toolbar({ fileInputRef, onAddUserPrompt, onAddSkill }: ToolbarProps) {
  const { config } = useChatInput()
  const [showPromptMenu, setShowPromptMenu] = useState(false)
  const skills = useAllSkills()
  const isLoading = useSkillsLoading()
  const currentTabId = useDexieMessageStore(s => s.currentTabId)
  const userId = useDexieMessageStore(s => s.session?.userId ?? null)
  const messages = useTabMessages(currentTabId, userId)
  const { activateSelector, selectorActive } = usePanelContext()
  const isSandboxOpen = useSandbox()
  const isSandboxMinimized = useSandboxMinimized()
  const showSelectorButton = isSandboxOpen && !isSandboxMinimized

  // Plan mode state
  const planMode = usePlanMode()
  const { togglePlanMode } = usePlanModeActions()

  if (!config.enableCamera) {
    return null
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  /** @deprecated Use handleAddSkill instead */
  const _handleAddPrompt = (promptType: string, data: any, displayName: string, userFacingDescription?: string) => {
    if (!onAddUserPrompt) return
    onAddUserPrompt(promptType, data, displayName, userFacingDescription)
    setShowPromptMenu(false)
  }

  const handleAddSkill = (skill: Skill) => {
    if (onAddSkill) {
      onAddSkill(skill.id, skill.displayName, skill.description, skill.prompt, skill.source)
    } else if (onAddUserPrompt) {
      // Fallback to legacy handler
      onAddUserPrompt(skill.id, skill.prompt, skill.displayName, skill.description)
    }
    setShowPromptMenu(false)
  }

  const handleCopyMessages = async () => {
    if (messages.length === 0) {
      toast.error("No messages to copy")
      return
    }

    const formatted = formatMessagesAsText(messages)

    try {
      await navigator.clipboard.writeText(formatted)
      toast.success("Messages copied")
    } catch {
      toast.error("Failed to copy")
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Copy Messages - hidden for now */}
      <button
        type="button"
        onClick={handleCopyMessages}
        className="hidden items-center justify-center size-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 transition-colors"
        aria-label="Copy messages"
        title="Copy messages"
      >
        <Copy className="size-4" />
      </button>

      {/* Skills Menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPromptMenu(!showPromptMenu)}
          className="flex items-center justify-center size-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 transition-colors"
          aria-label="Skills"
          title="Skills"
        >
          <ClipboardList className="size-4" />
        </button>

        {showPromptMenu && (
          <>
            {/* Backdrop */}
            <button
              type="button"
              className="fixed inset-0 z-10 bg-transparent border-0 p-0 cursor-default"
              onClick={() => setShowPromptMenu(false)}
              onKeyDown={e => e.key === "Escape" && setShowPromptMenu(false)}
              aria-label="Close menu"
            />

            {/* Menu */}
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-xl ring-1 ring-black/[0.04] dark:ring-white/[0.04] z-20 max-h-96 overflow-y-auto overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="p-1.5 space-y-0.5">
                {isLoading ? (
                  <div className="px-3 py-5 text-center text-xs text-black/35 dark:text-white/35">
                    Loading skills...
                  </div>
                ) : skills.length === 0 ? (
                  <div className="px-3 py-5 text-center text-xs text-black/35 dark:text-white/35">
                    No skills available. Add some in Settings.
                  </div>
                ) : (
                  skills.map(skill => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => handleAddSkill(skill)}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.07] dark:active:bg-white/[0.09] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 flex items-center justify-center rounded-lg bg-purple-500/10 shrink-0">
                          {skill.source === "global" ? (
                            <Globe className="size-4 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <User className="size-4 text-purple-600 dark:text-purple-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-black/80 dark:text-white/80 truncate">
                            {skill.displayName}
                          </div>
                          <div className="text-[11px] text-black/40 dark:text-white/40 truncate">
                            {skill.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Select Element - only show when sandbox preview is open and visible */}
      {showSelectorButton && (
        <button
          type="button"
          onClick={activateSelector}
          className={`flex items-center justify-center size-8 rounded-full transition-colors ${
            selectorActive
              ? "bg-purple-500/20 text-purple-400"
              : "hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70"
          }`}
          aria-label="Select element"
          title="Select element from preview (or hold Cmd/Ctrl)"
        >
          <MousePointer2 className="size-4" />
        </button>
      )}

      {/* Plan Mode Toggle */}
      <button
        type="button"
        onClick={togglePlanMode}
        className={`flex items-center justify-center size-8 rounded-full transition-colors ${
          planMode
            ? "bg-blue-500/20 text-blue-500 dark:text-blue-400"
            : "hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70"
        }`}
        aria-label={planMode ? "Disable plan mode" : "Enable plan mode"}
        title={
          planMode
            ? "Plan mode ON - Claude will only explore, not modify"
            : "Plan mode OFF - Click to enable planning only"
        }
      >
        <FileText className="size-4" />
      </button>

      <button
        type="button"
        onClick={handleClick}
        className="flex items-center justify-center size-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 transition-colors"
        aria-label="Upload photo"
      >
        <Camera className="size-4" />
      </button>
    </div>
  )
}
