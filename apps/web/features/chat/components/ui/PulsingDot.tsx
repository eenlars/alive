/**
 * PulsingDot - Green pulsing indicator used throughout chat UI
 * for loading/thinking states
 */

import { cn } from "@/lib/utils"

interface PulsingDotProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
}

export function PulsingDot({ size = "md", className }: PulsingDotProps) {
  return (
    <span
      className={cn("text-green-600 dark:text-green-500 thinking-grow", sizeClasses[size], className)}
      aria-hidden="true"
    >
      •
    </span>
  )
}
