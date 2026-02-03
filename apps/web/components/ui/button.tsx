import type React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
  children: React.ReactNode
}

export function Button({ children, className = "", variant = "default", size = "default", ...props }: ButtonProps) {
  const variants = {
    default: "bg-black dark:bg-white text-white dark:text-black shadow hover:bg-black/90 dark:hover:bg-white/90",
    destructive: "bg-red-600 dark:bg-red-600 text-white shadow-sm hover:bg-red-700 dark:hover:bg-red-700",
    outline:
      "border border-black/20 dark:border-white/20 bg-transparent shadow-sm hover:bg-black/5 dark:hover:bg-white/5 text-black dark:text-white",
    secondary:
      "bg-black/10 dark:bg-white/10 text-black dark:text-white shadow-sm hover:bg-black/20 dark:hover:bg-white/20",
    ghost: "hover:bg-black/5 dark:hover:bg-white/5 text-black dark:text-white",
    link: "text-black dark:text-white underline-offset-4 hover:underline",
  }

  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  }

  return (
    <button
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black dark:focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
