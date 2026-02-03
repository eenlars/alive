"use client"

import { type ClipboardEvent, useEffect, useRef } from "react"
import { useChatInput } from "./ChatInputContext"

export function InputArea() {
  const { message, setMessage, onSubmit, config, registerTextareaRef } = useChatInput()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Register textarea ref with parent ChatInput for focus management
  useEffect(() => {
    registerTextareaRef(textareaRef.current)
    return () => registerTextareaRef(null)
  }, [registerTextareaRef])

  // Trim pasted content (collapse newlines to spaces)
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData("text")
    const trimmed = pastedText.replace(/\n+/g, " ").trim()

    // Insert at cursor position
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = message.slice(0, start) + trimmed + message.slice(end)
      setMessage(newValue)

      // Restore cursor position after state update
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + trimmed.length
      })
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      const minHeightPx = parseInt(config.minHeight ?? "80px", 10)
      // Default max height is 2x min height for auto-grow
      const maxHeightPx = parseInt(config.maxHeight ?? "160px", 10)

      // Reset to min height
      textareaRef.current.style.height = `${minHeightPx}px`

      // Calculate content height
      const scrollHeight = textareaRef.current.scrollHeight
      const newHeight = Math.min(Math.max(scrollHeight, minHeightPx), maxHeightPx)
      textareaRef.current.style.height = `${newHeight}px`
    }
  }, [message, config.minHeight, config.maxHeight])

  return (
    <textarea
      ref={textareaRef}
      value={message}
      onChange={e => setMessage(e.target.value)}
      onPaste={handlePaste}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          onSubmit()
        }
      }}
      placeholder={config.placeholder}
      className="w-full resize-none border-0 bg-transparent text-base leading-relaxed font-normal focus:outline-none py-3 px-4 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 no-scrollbar"
      rows={1}
      data-testid="message-input"
      aria-label="Message input"
    />
  )
}
