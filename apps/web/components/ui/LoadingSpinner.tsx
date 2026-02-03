interface LoadingSpinnerProps {
  message?: string
  size?: "sm" | "md" | "lg"
}

const sizes = {
  sm: "w-5 h-5",
  md: "w-8 h-8",
  lg: "w-12 h-12",
}

export function LoadingSpinner({ message, size = "md" }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div
        className={`${sizes[size]} border-2 border-black/20 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin`}
      />
      {message && <p className="text-sm text-black/40 dark:text-white/40">{message}</p>}
    </div>
  )
}
