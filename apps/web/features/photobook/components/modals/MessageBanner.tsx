interface MessageBannerProps {
  message: string
  type: "error" | "success"
}

export function MessageBanner({ message, type }: MessageBannerProps) {
  const styles = {
    error: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50",
    success: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 font-medium",
  }

  return (
    <div className="mb-8 text-center" role="alert" aria-live="polite">
      <p className={`${styles[type]} px-6 py-3 rounded-full inline-block`}>{message}</p>
    </div>
  )
}
