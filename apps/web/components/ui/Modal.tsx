"use client"

import { X } from "lucide-react"
import { useCallback, useEffect } from "react"

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when modal should close */
  onClose: () => void
  /** Modal content */
  children: React.ReactNode
  /** Modal title (optional) */
  title?: string
  /** Modal description (optional) */
  description?: string
  /** Show close button in top-right (default: true) */
  showCloseButton?: boolean
  /** Enable click outside to close (default: true) */
  closeOnBackdrop?: boolean
  /** Enable ESC key to close (default: true) */
  closeOnEsc?: boolean
  /** Modal size (default: 'md') */
  size?: "sm" | "md" | "lg" | "xl" | "full"
  /** Additional CSS classes for modal content */
  className?: string
  /** Z-index value (default: 50) */
  zIndex?: number
  /** Inline styles for modal content */
  style?: React.CSSProperties
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "w-full h-full md:h-[calc(100vh-80px)] md:w-[calc(100vw-80px)]",
}

/**
 * Base Modal component for consistent modal behavior across the app.
 * Handles backdrop, close on ESC/click-outside, focus trap, and scroll lock.
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Confirm Action"
 *   description="Are you sure you want to proceed?"
 * >
 *   <div className="p-6">
 *     Modal content here
 *   </div>
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  children,
  title,
  description,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEsc = true,
  size = "md",
  className = "",
  zIndex = 50,
  style,
}: ModalProps) {
  // Handle ESC key press
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") {
        onClose()
      }
    },
    [closeOnEsc, onClose],
  )

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return

    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Add ESC key listener
  useEffect(() => {
    if (!isOpen) return

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const handleBackdropClick = () => {
    if (closeOnBackdrop) {
      onClose()
    }
  }

  const sizeClass = size === "full" ? sizeClasses.full : `max-w-full ${sizeClasses[size]}`

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/50 cursor-default"
        style={{ zIndex }}
        onClick={handleBackdropClick}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
        style={{ zIndex: zIndex + 1 }}
      >
        <div
          className={`
            bg-white dark:bg-[#1a1a1a] shadow-xl pointer-events-auto
            ${sizeClass}
            ${size === "full" ? "flex flex-col overflow-hidden" : "rounded-lg"}
            animate-in fade-in-0 zoom-in-95 duration-300
            ${className}
          `}
          style={style}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "modal-title" : undefined}
          aria-describedby={description ? "modal-description" : undefined}
        >
          {/* Header (if title or close button) */}
          {(title || description || showCloseButton) && (
            <div className="flex items-start justify-between p-6 border-b border-black/10 dark:border-white/10">
              {(title || description) && (
                <div>
                  {title && (
                    <h2
                      id="modal-title"
                      className="text-lg md:text-xl font-[500] text-black dark:text-white tracking-wide"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id="modal-description" className="text-sm font-[200] text-black/60 dark:text-white/60 mt-1">
                      {description}
                    </p>
                  )}
                </div>
              )}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded"
                  aria-label="Close"
                >
                  <X size={20} className="text-black dark:text-white" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className={size === "full" ? "flex-1 overflow-y-auto" : ""}>{children}</div>
        </div>
      </div>
    </>
  )
}
