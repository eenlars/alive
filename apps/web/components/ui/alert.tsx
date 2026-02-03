import type React from "react"

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive"
  children: React.ReactNode
}

export function Alert({ children, className = "", variant = "default", ...props }: AlertProps) {
  const variants = {
    default: "bg-white dark:bg-zinc-900 text-black dark:text-white border-black/20 dark:border-white/20",
    destructive:
      "border-red-500/50 dark:border-red-500/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 [&>svg]:text-red-600 dark:[&>svg]:text-red-400",
  }

  return (
    <div
      className={`relative w-full rounded-lg border px-4 py-3 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function AlertDescription({ children, className = "", ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div className={`text-sm [&_p]:leading-relaxed ${className}`} {...props}>
      {children}
    </div>
  )
}
