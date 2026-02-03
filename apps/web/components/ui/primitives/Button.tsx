import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "destructive"
  size?: "sm" | "md" | "lg"
  loading?: boolean
  icon?: ReactNode
  iconPosition?: "left" | "right"
  fullWidth?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      iconPosition = "left",
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        className={cn(
          // Base styles
          "inline-flex items-center justify-center font-medium uppercase tracking-wide transition-[background-color,border-color,color,transform,opacity] rounded-lg",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black dark:focus:ring-white dark:focus:ring-offset-zinc-950",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "active:scale-[0.98]",

          // Size variants
          {
            "px-3 py-2 text-xs": size === "sm",
            "px-4 py-3 text-sm": size === "md",
            "px-6 py-4 text-base": size === "lg",
          },

          // Width
          {
            "w-full": fullWidth,
          },

          // Variant styles
          {
            "bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 focus:ring-black dark:focus:ring-white":
              variant === "primary",
            "bg-transparent text-black dark:text-white border border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 hover:border-black dark:hover:border-white focus:ring-black dark:focus:ring-white":
              variant === "ghost",
            "bg-red-600 dark:bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-700 focus:ring-red-600":
              variant === "destructive",
          },

          className,
        )}
        disabled={isDisabled}
        ref={ref}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            aria-label="Loading spinner"
            role="img"
          >
            <title aria-label="Loading spinner">Loading spinner</title>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}

        {icon && iconPosition === "left" && !loading && <span className="mr-2">{icon}</span>}

        {children}

        {icon && iconPosition === "right" && !loading && <span className="ml-2">{icon}</span>}
      </button>
    )
  },
)

Button.displayName = "Button"

export { Button }
