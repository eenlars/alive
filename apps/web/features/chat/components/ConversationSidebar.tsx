"use client"

import { REFERRAL } from "@webalive/shared"
import { AnimatePresence, motion } from "framer-motion"
import { Archive, ArchiveRestore, ChevronRight, Heart, PanelLeftClose, Pencil, Plus, Settings2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useDexieArchivedConversations, useDexieConversations, useDexieSession } from "@/lib/db/dexieMessageStore"
import type { DbConversation } from "@/lib/db/messageDb"
import { useSidebarActions, useSidebarOpen } from "@/lib/stores/conversationSidebarStore"
import { useAppHydrated } from "@/lib/stores/HydrationBoundary"
import { useStreamingStore } from "@/lib/stores/streamingStore"

// Shared style constants for DRY code
const styles = {
  // Backgrounds
  panel: "bg-white dark:bg-neutral-900",
  backdrop: "bg-black/40 dark:bg-black/60",
  // Borders - consistent opacity scale
  border: "border-black/[0.08] dark:border-white/[0.08]",
  borderSubtle: "border-black/[0.06] dark:border-white/[0.06]",
  // Hover states - low opacity fills
  hoverFill: "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
  activeFill: "bg-black/[0.04] dark:bg-white/[0.06]",
  hoverFillStrong: "hover:bg-black/[0.07] dark:hover:bg-white/[0.09]",
  // Text colors
  textPrimary: "text-black dark:text-white",
  textMuted: "text-black/40 dark:text-white/40",
  textSubtle: "text-black/30 dark:text-white/30",
  // Transitions
  transition: "transition-colors duration-150 ease-in-out",
  transitionAll: "transition-all duration-150 ease-in-out",
} as const

// Reusable close button component - matches header icon button style
function CloseButton({ onClick, isMobile }: { onClick: () => void; isMobile?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center size-10 rounded-xl text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:bg-black/[0.12] dark:active:bg-white/[0.12] active:scale-95 transition-all duration-150 ease-out"
      aria-label="Close sidebar"
    >
      {isMobile ? <X size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
    </button>
  )
}

interface ConversationSidebarProps {
  workspace: string | null
  activeTabGroupId: string | null
  onTabGroupSelect: (tabGroupId: string) => void
  onArchiveTabGroup: (tabGroupId: string) => void
  onUnarchiveTabGroup: (tabGroupId: string) => void
  onRenameTabGroup: (tabGroupId: string, title: string) => void
  onNewConversation: () => void
  onOpenSettings: () => void
  onOpenInvite: () => void
}

export function ConversationSidebar({
  workspace,
  activeTabGroupId,
  onTabGroupSelect,
  onArchiveTabGroup,
  onUnarchiveTabGroup,
  onRenameTabGroup,
  onNewConversation,
  onOpenSettings,
  onOpenInvite,
}: ConversationSidebarProps) {
  const isOpen = useSidebarOpen()
  const { closeSidebar } = useSidebarActions()
  const isHydrated = useAppHydrated()
  const session = useDexieSession()
  const allConversations = useDexieConversations(workspace || "", session)
  const conversations = workspace ? allConversations : []
  const archivedConversations = useDexieArchivedConversations(workspace || "", session)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [archiveModalOpen, setArchiveModalOpen] = useState(false)
  const [conversationToArchive, setConversationToArchive] = useState<DbConversation | null>(null)
  const [archivedExpanded, setArchivedExpanded] = useState(false)

  // Get streaming state for all tabs to show activity indicator
  const streamingTabs = useStreamingStore(state => state.tabs)

  // Memoized handlers
  const handleTabGroupClick = useCallback(
    (tabGroupId: string) => {
      onTabGroupSelect(tabGroupId)
      // Close sidebar on mobile after selection
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        closeSidebar()
      }
    },
    [onTabGroupSelect, closeSidebar],
  )

  const handleArchiveClick = useCallback((e: React.MouseEvent, conversation: DbConversation) => {
    e.stopPropagation()
    setConversationToArchive(conversation)
    setArchiveModalOpen(true)
  }, [])

  const handleConfirmArchive = useCallback(() => {
    if (conversationToArchive) {
      onArchiveTabGroup(conversationToArchive.id)
    }
    setArchiveModalOpen(false)
    setConversationToArchive(null)
  }, [conversationToArchive, onArchiveTabGroup])

  const handleCancelArchive = useCallback(() => {
    setArchiveModalOpen(false)
    setConversationToArchive(null)
  }, [])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar()
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, closeSidebar])

  // Check if any tab in a conversation is streaming
  const isConversationStreaming = useCallback(
    (conversationId: string) => {
      // Check if any tab that belongs to this conversation is actively streaming
      return Object.entries(streamingTabs).some(([tabId, tabState]) => {
        // Tab IDs include the conversation ID, check if streaming
        return tabId.includes(conversationId) && tabState.isStreamActive
      })
    },
    [streamingTabs],
  )

  // Shared sidebar content - rendered in both desktop and mobile
  const renderContent = (isMobile: boolean) => (
    <div className={`flex flex-col h-full ${isMobile ? "w-screen" : "w-[280px]"}`}>
      {/* iOS 26 Liquid Glass: extend background into safe area, then add padding for content */}
      {isMobile && <div className={`${styles.panel} shrink-0`} style={{ height: "env(safe-area-inset-top, 0px)" }} />}
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3.5 border-b ${styles.borderSubtle}`}>
        <h2 className={`text-sm font-medium ${styles.textPrimary}`}>Conversations</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onNewConversation()
              if (isMobile) closeSidebar()
            }}
            className="inline-flex items-center justify-center size-10 rounded-xl text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:bg-black/[0.12] dark:active:bg-white/[0.12] active:scale-95 transition-all duration-150 ease-out"
            aria-label="New conversation"
          >
            <Plus size={18} strokeWidth={1.75} />
          </button>
          <CloseButton onClick={closeSidebar} isMobile={isMobile} />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {!isHydrated ? (
          <EmptyState>Loading...</EmptyState>
        ) : conversations.length === 0 && archivedConversations.length === 0 ? (
          <EmptyState>No conversations yet</EmptyState>
        ) : (
          <div className="py-1">
            {/* Active conversations */}
            {conversations.length > 0 && (
              <AnimatePresence mode="popLayout">
                {conversations.map(conversation => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={conversation.id === activeTabGroupId}
                    isStreaming={isConversationStreaming(conversation.id)}
                    onClick={() => handleTabGroupClick(conversation.id)}
                    onArchive={handleArchiveClick}
                    onRename={(id, title) => onRenameTabGroup(id, title)}
                  />
                ))}
              </AnimatePresence>
            )}

            {/* Archived section */}
            {archivedConversations.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setArchivedExpanded(prev => !prev)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium ${styles.textMuted} hover:text-black/60 dark:hover:text-white/60 ${styles.hoverFill} ${styles.transition} rounded-lg mx-1`}
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform duration-150 ${archivedExpanded ? "rotate-90" : ""}`}
                  />
                  <span>Archived ({archivedConversations.length})</span>
                </button>
                <AnimatePresence>
                  {archivedExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      {archivedConversations.map(conversation => (
                        <ArchivedConversationItem
                          key={conversation.id}
                          conversation={conversation}
                          onOpen={() => {
                            onUnarchiveTabGroup(conversation.id)
                            handleTabGroupClick(conversation.id)
                          }}
                          onRestore={() => onUnarchiveTabGroup(conversation.id)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions - with safe area padding for mobile home indicator */}
      <FooterActions onOpenInvite={onOpenInvite} onOpenSettings={onOpenSettings} isMobile={isMobile} />
    </div>
  )

  return (
    <>
      {/* Desktop sidebar - static layout with width animation */}
      <aside
        ref={sidebarRef}
        className={`hidden md:flex flex-col h-full ${styles.panel} border-r ${styles.border} ${styles.transitionAll} overflow-hidden ${
          isOpen ? "w-[280px]" : "w-0 border-r-0"
        }`}
        aria-label="Conversation history"
      >
        {renderContent(false)}
      </aside>

      {/* Mobile sidebar - overlay with slide animation */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`md:hidden fixed inset-0 ${styles.backdrop} z-50`}
              onClick={closeSidebar}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className={`md:hidden fixed inset-y-0 left-0 ${styles.panel} z-50 flex flex-col shadow-xl`}
              aria-label="Conversation history"
            >
              {renderContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Archive confirmation modal */}
      <AnimatePresence>
        {archiveModalOpen && conversationToArchive && (
          <ArchiveModal
            conversation={conversationToArchive}
            isActive={conversationToArchive.id === activeTabGroupId}
            onConfirm={handleConfirmArchive}
            onCancel={handleCancelArchive}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// Empty state component
function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className={`px-4 py-8 text-center text-sm ${styles.textMuted}`}>{children}</div>
}

// Footer with share and settings - uses safe area for mobile home indicator
function FooterActions({
  onOpenInvite,
  onOpenSettings,
  isMobile,
}: {
  onOpenInvite: () => void
  onOpenSettings: () => void
  isMobile?: boolean
}) {
  return (
    <div className={`border-t ${styles.borderSubtle}`}>
      <div className="p-3 space-y-2">
        {REFERRAL.ENABLED && (
          <button
            type="button"
            onClick={onOpenInvite}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl ${styles.activeFill} ${styles.hoverFillStrong} ${styles.transition} group`}
          >
            <Heart
              size={18}
              className={`${styles.textMuted} group-hover:text-black/60 dark:group-hover:text-white/60`}
            />
            <div className="flex-1 min-w-0 text-left">
              <div className={`text-sm ${styles.textPrimary} truncate`}>Share Alive</div>
              <div className={`text-xs ${styles.textMuted} truncate`}>with someone you love</div>
            </div>
            <ChevronRight size={14} className={styles.textSubtle} />
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center justify-center size-10 rounded-xl text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:bg-black/[0.12] dark:active:bg-white/[0.12] active:scale-95 transition-all duration-150 ease-out"
          aria-label="Settings"
        >
          <Settings2 size={18} strokeWidth={1.75} />
        </button>
      </div>
      {/* iOS 26 Liquid Glass: extend background into bottom safe area */}
      {isMobile && <div className={styles.panel} style={{ height: "env(safe-area-inset-bottom, 0px)" }} />}
    </div>
  )
}

// Streaming indicator dot
function StreamingDot() {
  return (
    <span className="relative flex size-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
    </span>
  )
}

// Conversation item component
function ConversationItem({
  conversation,
  isActive,
  isStreaming,
  onClick,
  onArchive,
  onRename,
}: {
  conversation: DbConversation
  isActive: boolean
  isStreaming: boolean
  onClick: () => void
  onArchive: (e: React.MouseEvent, conversation: DbConversation) => void
  onRename: (id: string, title: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onClick()
    }
  }

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(conversation.title)
    setIsEditing(true)
    // Focus input after state update
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleSaveEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditValue(conversation.title)
    setIsEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.15 }}
      role="button"
      tabIndex={isEditing ? -1 : 0}
      onClick={isEditing ? undefined : onClick}
      onKeyDown={handleKeyDown}
      className={`mx-2 px-3 py-2.5 rounded-xl cursor-pointer group ${styles.transition} ${
        isActive ? `${styles.activeFill} ring-1 ring-black/[0.08] dark:ring-white/[0.08]` : styles.hoverFill
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleEditKeyDown}
              className={`w-full text-sm font-medium ${styles.textPrimary} bg-black/[0.02] dark:bg-white/[0.04] border-0 rounded-lg px-2 py-1 outline-none ring-1 ring-black/[0.12] dark:ring-white/[0.12] focus:ring-black/[0.2] dark:focus:ring-white/[0.2] transition-all duration-150`}
            />
          ) : (
            <div className={`text-sm font-medium ${styles.textPrimary} line-clamp-2 flex items-center gap-2`}>
              {isStreaming && <StreamingDot />}
              <span className="flex-1 min-w-0 truncate">{conversation.title}</span>
            </div>
          )}
          <div className={`text-xs ${styles.textMuted} mt-0.5 flex items-center gap-1.5`}>
            <span>{formatTimestamp(conversation.updatedAt)}</span>
            <span className={styles.textSubtle}>·</span>
            <span>{conversation.messageCount ?? 0} messages</span>
          </div>
        </div>
        {!isEditing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleStartEdit}
              className={`opacity-40 md:opacity-0 md:group-hover:opacity-100 size-7 rounded-full flex items-center justify-center ${styles.hoverFillStrong} ${styles.transitionAll} active:scale-95 md:hover:scale-110`}
              aria-label="Rename conversation"
            >
              <Pencil size={13} className={styles.textMuted} />
            </button>
            <button
              type="button"
              onClick={e => onArchive(e, conversation)}
              className={`opacity-40 md:opacity-0 md:group-hover:opacity-100 size-7 rounded-full flex items-center justify-center ${styles.hoverFillStrong} ${styles.transitionAll} active:scale-95 md:hover:scale-110`}
              aria-label="Archive conversation"
            >
              <Archive size={13} className={styles.textMuted} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// Archived conversation item - clickable to open, with restore button
function ArchivedConversationItem({
  conversation,
  onOpen,
  onRestore,
}: {
  conversation: DbConversation
  onOpen: () => void
  onRestore: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`mx-2 px-3 py-2 rounded-xl group cursor-pointer ${styles.transition} ${styles.hoverFill} w-full text-left`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 opacity-50 group-hover:opacity-70 transition-opacity">
          <div className={`text-sm ${styles.textPrimary} truncate`}>{conversation.title}</div>
          <div className={`text-xs ${styles.textMuted} mt-0.5`}>
            Archived {formatTimestamp(conversation.archivedAt ?? conversation.updatedAt)}
          </div>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: Nested buttons are invalid HTML, using span with role instead */}
        <span
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation()
            onRestore()
          }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.stopPropagation()
              onRestore()
            }
          }}
          className={`opacity-40 md:opacity-0 md:group-hover:opacity-100 size-7 rounded-full flex items-center justify-center ${styles.hoverFillStrong} ${styles.transitionAll} active:scale-95 md:hover:scale-110`}
          aria-label="Restore without opening"
        >
          <ArchiveRestore size={13} className={styles.textMuted} />
        </span>
      </div>
    </button>
  )
}

// Archive confirmation modal
function ArchiveModal({
  conversation,
  isActive,
  onConfirm,
  onCancel,
}: {
  conversation: DbConversation
  isActive: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-dialog-title"
      className={`fixed inset-0 ${styles.backdrop} z-[60] flex items-center justify-center p-4`}
      onClick={onCancel}
      onKeyDown={e => e.key === "Escape" && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        onClick={e => e.stopPropagation()}
        className={`${styles.panel} border ${styles.border} rounded-2xl shadow-xl ring-1 ring-black/[0.04] dark:ring-white/[0.04] max-w-sm w-full overflow-hidden`}
      >
        <div className={`px-5 py-4 border-b ${styles.borderSubtle}`}>
          <h3 id="archive-dialog-title" className={`text-base font-medium ${styles.textPrimary}`}>
            Archive conversation
          </h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-black/60 dark:text-white/60 mb-3">
            {isActive
              ? "Archive this conversation? A new conversation will be started."
              : "Archive this conversation? You can restore it later."}
          </p>
          <p
            className={`text-sm font-medium ${styles.textPrimary} line-clamp-2 ${styles.activeFill} px-3 py-2 rounded-xl`}
          >
            {conversation.title}
          </p>
        </div>
        <div className={`px-5 py-4 border-t ${styles.borderSubtle} flex items-center justify-end gap-2`}>
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2.5 text-sm font-medium ${styles.textPrimary} ${styles.hoverFill} rounded-xl ${styles.transition} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2.5 text-sm font-medium bg-black text-white dark:bg-white dark:text-black rounded-xl hover:brightness-[0.85] active:brightness-75 active:scale-[0.98] ${styles.transition} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/30 focus-visible:ring-offset-2`}
          >
            Archive
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// Utility: format timestamp as relative time
function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
