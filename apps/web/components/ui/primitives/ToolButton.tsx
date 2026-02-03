import type { ReactNode } from "react"
import { getToolIcon } from "@/lib/tool-icons"

interface ToolButtonProps {
  onClick: () => void
  children: ReactNode
  variant?: "default" | "error"
}

export function ToolButton({ onClick, children, variant = "default" }: ToolButtonProps) {
  const toolName = typeof children === "string" ? children : ""
  const Icon = getToolIcon(toolName)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-normal transition-colors flex items-center gap-1.5 ${
        variant === "error"
          ? "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          : "text-black/35 dark:text-white/35 hover:text-black/50 dark:hover:text-white/50"
      }`}
    >
      <Icon size={12} className="opacity-60" />
      <span>{children}</span>
    </button>
  )
}
