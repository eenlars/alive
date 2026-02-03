"use client"

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: "sm" | "md"
  "aria-label"?: string
}

export function Toggle({ checked, onChange, disabled = false, size = "md", "aria-label": ariaLabel }: ToggleProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked)
    }
  }

  const trackClasses = {
    sm: "w-11 h-6",
    md: "w-14 h-8 sm:w-11 sm:h-6",
  }

  const knobClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6 sm:w-4 sm:h-4",
  }

  const translateClasses = {
    sm: checked ? "translate-x-5" : "translate-x-0",
    md: checked ? "translate-x-6 sm:translate-x-5" : "translate-x-0",
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`relative rounded-full transition-colors flex-shrink-0 ${trackClasses[size]} ${
        checked ? "bg-green-500" : "bg-black/20 dark:bg-white/20"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
    >
      <span
        className={`absolute top-1 left-1 rounded-full bg-white shadow-sm transition-transform ${knobClasses[size]} ${translateClasses[size]}`}
      />
    </button>
  )
}
