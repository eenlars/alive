"use client"

import type { ReactNode } from "react"

interface ConfirmModalProps {
  title: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  confirmStyle?: "danger" | "primary" | "warning"
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmStyle = "primary",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmButtonClass =
    confirmStyle === "danger"
      ? "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 text-white"
      : confirmStyle === "warning"
        ? "bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-500 text-white"
        : "bg-black hover:bg-black/80 dark:bg-white dark:hover:bg-white/80 text-white dark:text-black"

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 border border-black/5 dark:border-white/10 w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        role="document"
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-black dark:text-white mb-2">{title}</h3>
          <div className="text-sm text-black/60 dark:text-white/60 leading-relaxed">{message}</div>
        </div>

        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 sm:py-2.5 text-sm font-medium text-black dark:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all active:scale-[0.98]"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-3 sm:py-2.5 text-sm font-medium rounded-lg transition-all active:scale-[0.98] ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
