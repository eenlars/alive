"use client"

interface ChatDropOverlayProps {
  isDragging: boolean
}

export function ChatDropOverlay({ isDragging }: ChatDropOverlayProps) {
  if (!isDragging) return null

  return (
    <div className="absolute inset-0 bg-black/5 dark:bg-white/5 backdrop-blur-sm z-40 pointer-events-none flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-medium text-black dark:text-white">Drop files to attach</p>
      </div>
    </div>
  )
}
