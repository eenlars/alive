import type React from "react"

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
  children: React.ReactNode
}

export function Badge({ children, className = "", variant = "default", ...props }: BadgeProps) {
  const variants = {
    default:
      "border-transparent bg-black dark:bg-white text-white dark:text-black shadow hover:bg-black/80 dark:hover:bg-white/80",
    secondary:
      "border-transparent bg-black/10 dark:bg-white/10 text-black dark:text-white hover:bg-black/20 dark:hover:bg-white/20",
    destructive:
      "border-transparent bg-red-600 dark:bg-red-600 text-white shadow hover:bg-red-700 dark:hover:bg-red-700",
    outline: "text-black dark:text-white border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5",
  }

  return (
    <div
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-2 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
