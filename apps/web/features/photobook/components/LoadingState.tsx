import { Image as ImageIcon } from "lucide-react"

interface LoadingStateProps {
  message: string
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <output className="text-center py-32 block animate-in fade-in duration-300" aria-live="polite">
      <div className="size-16 bg-black/[0.04] dark:bg-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-6">
        <ImageIcon className="size-8 text-black/30 dark:text-white/30 animate-pulse" />
      </div>
      <p className="text-black/40 dark:text-white/40">{message}</p>
    </output>
  )
}
