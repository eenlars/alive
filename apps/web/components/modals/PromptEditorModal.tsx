"use client"

import { Check, Copy, X } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

interface PromptEditorModalProps {
  mode: "add" | "edit"
  initialDisplayName?: string
  initialData?: string
  onSave: (displayName: string, data: string) => void
  onCancel: () => void
}

export function PromptEditorModal({
  mode,
  initialDisplayName = "",
  initialData = "",
  onSave,
  onCancel,
}: PromptEditorModalProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [data, setData] = useState(initialData)
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const handleCopy = async () => {
    if (!data.trim()) return
    try {
      await navigator.clipboard.writeText(data)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleSave = () => {
    if (displayName.trim() && data.trim()) {
      onSave(displayName.trim(), data.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to save
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSave()
    }
    // Escape to cancel
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  const canSave = displayName.trim() && data.trim()

  // Don't render on server
  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 z-[100] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in-0 duration-200"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-editor-title"
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-xl h-[85vh] sm:h-auto sm:max-h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="document"
      >
        {/* Mobile pull indicator */}
        <div className="sm:hidden w-full flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-gradient-to-br from-amber-50/50 to-yellow-50/50 dark:from-amber-950/20 dark:to-yellow-950/20">
          <div>
            <h2 id="prompt-editor-title" className="text-xl font-semibold text-black dark:text-white">
              {mode === "add" ? "Add New Skill" : "Edit Skill"}
            </h2>
            <p className="text-xs text-black/60 dark:text-white/60 mt-1">
              Use <kbd className="px-1.5 py-0.5 bg-black/10 dark:bg-white/10 rounded text-[10px]">Cmd+Enter</kbd> to
              save
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-all duration-200"
            aria-label="Close editor"
          >
            <X size={20} className="text-black/60 dark:text-white/60" />
          </button>
        </div>

        {/* Skill Name */}
        <div className="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <label htmlFor="prompt-name" className="block text-sm font-medium text-black dark:text-white mb-1.5">
            Skill Name
          </label>
          <input
            id="prompt-name"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g., 'Revise Code', 'Fix Bugs'"
            className="w-full px-3 py-2 bg-white dark:bg-[#2a2a2a] border border-black/20 dark:border-white/20 rounded-lg text-sm text-black dark:text-white focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 transition-colors"
          />
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-5 py-2 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between">
            <label htmlFor="prompt-content" className="text-sm font-medium text-black dark:text-white">
              Skill Content
            </label>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!data.trim()}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                copied
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : "bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {copied ? (
                <>
                  <Check size={14} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            <textarea
              id="prompt-content"
              value={data}
              onChange={e => setData(e.target.value)}
              placeholder="Enter your prompt text here"
              className="w-full h-full min-h-[200px] px-3 py-2.5 bg-white dark:bg-[#2a2a2a] border border-black/20 dark:border-white/20 rounded-lg text-sm text-black dark:text-white focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 transition-colors resize-none font-mono leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
          >
            {mode === "add" ? "Add Skill" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
