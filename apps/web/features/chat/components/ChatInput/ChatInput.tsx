"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react"
import toast from "react-hot-toast"
import { ChatInputProvider } from "./ChatInputContext"
import { useAttachments } from "./hooks/useAttachments"
import { useSuperTemplateDetection } from "./hooks/useTemplateDetection"
import { InputArea } from "./InputArea"
import { InputContainer } from "./InputContainer"
import { PromptBarAttachmentGrid } from "./PromptBarAttachmentGrid"
import { SendButton } from "./SendButton"
import { Toolbar } from "./Toolbar"
import type { ChatInputConfig, ChatInputContextValue, ChatInputHandle, ChatInputProps } from "./types"

/**
 * ChatInput - Clean, accessible chat input component
 *
 * Features:
 * - File paste support
 * - Image attachments with previews
 * - Photo library upload (camera icon)
 * - Error feedback with toasts
 * - Keyboard shortcuts (Cmd/Ctrl+K to focus)
 * - Exposes addAttachment via ref for parent drag handling
 */
export const ChatInput = forwardRef<ChatInputHandle, Omit<ChatInputProps, "children">>(function ChatInput(
  {
    message,
    setMessage,
    busy,
    isStopping = false,
    isReady = true,
    onSubmit,
    onStop,
    config: userConfig = {},
    onOpenTemplates,
    hideToolbar = false,
  },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const config: ChatInputConfig = useMemo(
    () => ({
      enableAttachments: true,
      enableCamera: false,
      maxAttachments: 10,
      maxFileSize: 10 * 1024 * 1024,
      placeholder: "Tell me what to change...",
      minHeight: "80px",
      maxHeight: "100px",
      onMessage: (msg, type) => {
        if (type === "error") {
          toast.error(msg)
        }
      },
      ...userConfig,
    }),
    [userConfig],
  )

  const {
    attachments,
    addAttachment,
    addPhotobookImage,
    addSuperTemplateAttachment,
    addUserPrompt,
    addSkill,
    addFileForAnalysis,
    removeAttachment,
    clearAttachments,
    toggleImageMode,
  } = useAttachments(config)

  // Detect supertemplate JSON in message and convert to attachments
  useSuperTemplateDetection(message, setMessage, attachments, addSuperTemplateAttachment)

  // Callback for InputArea to register its textarea ref
  const registerTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el
  }, [])

  // Expose methods to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      addAttachment,
      addPhotobookImage,
      addSuperTemplateAttachment,
      addUserPrompt,
      addSkill,
      addFileForAnalysis,
      getAttachments: () => attachments,
      clearLibraryImages: () => {
        const libraryImages = attachments.filter(a => a.kind === "library-image")
        for (const img of libraryImages) {
          removeAttachment(img.id)
        }
      },
      clearAllAttachments: clearAttachments,
      focus: () => {
        textareaRef.current?.focus()
      },
    }),
    [
      addAttachment,
      addPhotobookImage,
      addSuperTemplateAttachment,
      addUserPrompt,
      addSkill,
      addFileForAnalysis,
      attachments,
      removeAttachment,
      clearAttachments,
    ],
  )

  const canSubmit = useMemo(() => {
    if (!isReady || busy) return false
    const hasMessage = message.trim().length > 0
    const hasSkillOrPrompt = attachments.some(a => a.kind === "skill" || a.kind === "user-prompt")
    const attachmentsValid = attachments.every(a => !a.error && a.uploadProgress === 100)

    // Skills and user prompts can be sent alone without a message
    // Other attachments (images, templates) require a message
    if (hasSkillOrPrompt && attachmentsValid) return true
    return hasMessage && attachmentsValid
  }, [busy, isReady, message, attachments])

  // Just call parent onSubmit directly (prompt building happens in parent now)
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    onSubmit()
  }, [canSubmit, onSubmit])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        textareaRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const contextValue: ChatInputContextValue = useMemo(
    () => ({
      message,
      setMessage,
      attachments,
      addAttachment,
      removeAttachment,
      toggleImageMode,
      busy,
      isStopping,
      canSubmit,
      onSubmit: handleSubmit,
      onStop,
      config,
      registerTextareaRef,
    }),
    [
      message,
      setMessage,
      attachments,
      addAttachment,
      removeAttachment,
      toggleImageMode,
      busy,
      isStopping,
      canSubmit,
      handleSubmit,
      onStop,
      config,
      registerTextareaRef,
    ],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items)
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile()
          if (file) addAttachment(file)
        }
      }
    },
    [addAttachment],
  )

  return (
    <ChatInputProvider value={contextValue}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={config.allowedFileTypes?.join(",") || "image/*,.pdf,.txt,.md"}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          for (const file of files) addAttachment(file)
          if (fileInputRef.current) fileInputRef.current.value = ""
        }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <section
        className="relative flex-shrink-0 px-4 pb-4 safe-area-inset-bottom"
        aria-label="Chat input"
        onPaste={handlePaste}
      >
        <div className="relative">
          <InputContainer>
            {/* Attachments */}
            <PromptBarAttachmentGrid />

            {/* Input area */}
            <InputArea />

            {/* Bottom row: toolbar left, send button right */}
            <div className="flex items-center px-3 pb-3">
              {/* Toolbar buttons */}
              <div className="flex-1">
                {!hideToolbar && (
                  <Toolbar
                    fileInputRef={fileInputRef}
                    onOpenTemplates={onOpenTemplates}
                    onAddUserPrompt={addUserPrompt}
                    onAddSkill={addSkill}
                  />
                )}
              </div>

              {/* Send button */}
              <SendButton />
            </div>
          </InputContainer>
        </div>
      </section>
    </ChatInputProvider>
  )
})
