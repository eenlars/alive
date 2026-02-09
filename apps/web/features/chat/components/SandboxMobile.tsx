"use client"
import { PREVIEW_MESSAGES } from "@webalive/shared"
import { motion } from "framer-motion"
import { RotateCw, Square, X } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { usePanelContext } from "@/features/chat/lib/sandbox-context"
import { useWorkspace } from "@/features/workspace/hooks/useWorkspace"
import { getPreviewUrl } from "@/lib/preview-utils"
import { PulsingDot } from "./ui/PulsingDot"

interface SandboxMobileProps {
  onClose: () => void
  children?: ReactNode
  busy?: boolean
  statusText?: string
  onStop?: () => void
}

export function SandboxMobile({ onClose, children, busy, statusText, onStop }: SandboxMobileProps) {
  const { workspace } = useWorkspace({ allowEmpty: true })
  const { setSelectedElement, selectorActive, deactivateSelector } = usePanelContext()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [path, setPath] = useState("/")
  const [isLoading, setIsLoading] = useState(true)

  const previewUrl = workspace ? getPreviewUrl(workspace, { path }) : ""

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIsLoading(true)
      // Force reload by adding cache-busting param
      const url = new URL(previewUrl)
      url.searchParams.set("_t", Date.now().toString())
      iframeRef.current.src = url.toString()
    }
  }

  // Callback ref to store iframe element (load event is unreliable for cross-origin iframes)
  const setIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe
  }, [])

  // Sync selector state after iframe loads
  useEffect(() => {
    if (!isLoading && selectorActive && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "alive-tagger-activate" }, "*")
    }
  }, [isLoading, selectorActive])

  // NOTE: Loading state is managed entirely via postMessage from the injected nav script:
  // - NAVIGATION_START sets isLoading=true (SPA navigation began)
  // - NAVIGATION sets isLoading=false (page loaded and script executed)

  // Listen for postMessage from iframe (preview sites send navigation events + element selection)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Navigation started - show loading
      if (event.data?.type === PREVIEW_MESSAGES.NAVIGATION_START) {
        setIsLoading(true)
        return
      }
      // Navigation completed - update path and clear loading
      if (event.data?.type === PREVIEW_MESSAGES.NAVIGATION && typeof event.data.path === "string") {
        const newPath = event.data.path || "/"
        if (newPath !== path) {
          setPath(newPath)
        }
        setIsLoading(false)
        return
      }
      // Element selected via alive-tagger (Cmd+Click in dev mode)
      if (event.data?.type === "alive-element-selected" && event.data.context) {
        const ctx = event.data.context
        console.log(
          "[SandboxMobile] Element selected:",
          ctx.displayName,
          "at",
          `${ctx.fileName}:${ctx.lineNumber}`,
          ctx,
        )
        setSelectedElement({
          displayName: ctx.displayName,
          fileName: ctx.fileName,
          lineNumber: ctx.lineNumber,
          columnNumber: ctx.columnNumber,
        })
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [path, setSelectedElement])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Send activation/deactivation message to iframe when selectorActive changes
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: selectorActive ? "alive-tagger-activate" : "alive-tagger-deactivate" },
        "*",
      )
    }
  }, [selectorActive])

  // Reset selector state when mobile sandbox unmounts (closes)
  useEffect(() => {
    return () => {
      deactivateSelector()
    }
  }, [deactivateSelector])

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Iframe content */}
      <div className="flex-1 overflow-hidden bg-white relative">
        {workspace && workspace.length > 0 && workspace.includes(".") ? (
          <>
            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 alive-logo-outer" />
                    <div className="absolute inset-1.5 rounded-full bg-emerald-400/30 alive-logo-inner" />
                    <div className="absolute inset-3 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-neutral-300">Opening your site</span>
                </div>
              </div>
            )}
            <iframe
              ref={setIframeRef}
              src={previewUrl}
              className="w-full h-full border-0"
              title={`Preview: ${workspace}`}
              referrerPolicy="no-referrer-when-downgrade"
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-700 bg-neutral-900">
            <div className="text-center">
              <div className="mb-2">{workspace ? "Invalid workspace format" : "No workspace selected"}</div>
              <div className="text-xs text-neutral-600">Workspace must be a domain (e.g., example.com)</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar with URL controls and chat input */}
      <div className="bg-neutral-950 border-t border-white/10">
        {/* URL bar row - compact on mobile */}
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2.5 text-neutral-400 hover:text-white active:bg-white/10 rounded-lg transition-colors"
            title="Refresh"
          >
            <RotateCw size={20} strokeWidth={2} />
          </button>
          <span className="flex-1 text-sm text-neutral-500 truncate">{path}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 text-neutral-400 hover:text-white active:bg-white/10 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status or chat input area */}
        {busy ? (
          <div className="border-t border-white/5 px-4 py-3 flex items-center gap-2">
            <PulsingDot size="sm" className="flex-shrink-0" />
            <span className="text-sm text-neutral-300 truncate flex-1">{statusText || "Working..."}</span>
            {onStop && (
              <button
                type="button"
                onClick={onStop}
                className="flex-shrink-0 p-2 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                aria-label="Stop"
              >
                <Square size={14} fill="currentColor" />
              </button>
            )}
          </div>
        ) : (
          children && <div className="border-t border-white/5 dark">{children}</div>
        )}
      </div>
    </motion.div>
  )
}
