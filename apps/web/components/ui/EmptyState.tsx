import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  message: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, message, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <Icon size={48} className="mx-auto mb-4 text-black/20 dark:text-white/20" />
      <p className="text-sm text-black/60 dark:text-white/60 mb-4">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-black/80 dark:hover:bg-white/80 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
