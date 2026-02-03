import { AlertTriangle } from "lucide-react"
import type { ReactNode } from "react"

interface DeleteModalProps {
  title: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteModal({
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}: DeleteModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-xl p-6 sm:p-8 max-w-md w-full shadow-xl shadow-black/10 dark:shadow-black/40 border border-black/5 dark:border-white/10 animate-in fade-in-0 slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        role="document"
      >
        {/* Icon */}
        <div className="w-14 h-14 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-red-500 dark:text-red-400" />
        </div>

        {/* Title */}
        <h3 id="delete-dialog-title" className="text-lg font-semibold text-black dark:text-white mb-2 text-center">
          {title}
        </h3>

        {/* Message */}
        <div className="text-sm text-black/60 dark:text-white/60 text-center mb-6 leading-relaxed">{message}</div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-5 py-3 sm:py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white rounded-lg transition-all font-medium text-sm active:scale-[0.98]"
            aria-label="Cancel deletion"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-5 py-3 sm:py-2.5 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 text-white rounded-lg transition-all font-medium text-sm active:scale-[0.98]"
            aria-label="Confirm deletion"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
