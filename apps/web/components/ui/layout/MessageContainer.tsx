import type { ReactNode } from "react"

interface MessageContainerProps {
  children: ReactNode
  className?: string
}

export function MessageContainer({ children, className = "" }: MessageContainerProps) {
  return <div className={`mb-6 ${className}`}>{children}</div>
}
