/**
 * Shared style constants for settings UI
 * Following UI polish patterns: opacity scale, rounding scale, transitions
 */

// =============================================================================
// OPACITY SCALE (from UI polish guide)
// =============================================================================
// /[0.03-0.04] - barely visible fill (rest state backgrounds)
// /[0.06-0.08] - subtle border/ring at rest
// /[0.10-0.12] - hover/focus interactive feedback
// /30 - whisper text (placeholders)
// /40 - muted text (subtitles, icons at rest)
// /50 - secondary text
// /60 - description text
// /70-80 - readable text (titles, icon hover)
// /90 - primary text

// =============================================================================
// INTERACTIVE ELEMENTS
// =============================================================================

/** Icon button (close, action icons) */
export const iconButton = `
  inline-flex items-center justify-center size-9 rounded-xl
  text-black/40 dark:text-white/40
  hover:text-black/70 dark:hover:text-white/70
  bg-black/[0.04] dark:bg-white/[0.04]
  hover:bg-black/[0.08] dark:hover:bg-white/[0.08]
  active:bg-black/[0.12] dark:active:bg-white/[0.12]
  active:scale-95 transition-all duration-150
`
  .replace(/\s+/g, " ")
  .trim()

/** Primary button (save, submit) */
export const primaryButton = `
  inline-flex items-center justify-center h-10 px-4
  bg-black dark:bg-white text-white dark:text-black
  text-sm font-medium rounded-xl
  hover:brightness-[0.85] active:brightness-75
  active:scale-[0.98] transition-all duration-150
  disabled:opacity-30 disabled:hover:brightness-100
`
  .replace(/\s+/g, " ")
  .trim()

/** Secondary button (clear, cancel) */
export const secondaryButton = `
  inline-flex items-center justify-center h-10 px-4
  bg-black/[0.04] dark:bg-white/[0.04] text-black/70 dark:text-white/70
  text-sm font-medium rounded-xl
  hover:bg-black/[0.08] dark:hover:bg-white/[0.08]
  active:bg-black/[0.12] dark:active:bg-white/[0.12]
  active:scale-[0.98] transition-all duration-150
`
  .replace(/\s+/g, " ")
  .trim()

/** Danger button (delete, logout) */
export const dangerButton = `
  inline-flex items-center justify-center h-10 px-4
  bg-red-500/10 dark:bg-red-500/10 text-red-600 dark:text-red-400
  text-sm font-medium rounded-xl
  hover:bg-red-500/15 dark:hover:bg-red-500/15
  active:bg-red-500/20 dark:active:bg-red-500/20
  active:scale-[0.98] transition-all duration-150
`
  .replace(/\s+/g, " ")
  .trim()

/** Small button (inline actions like "Get more") */
export const smallButton = `
  inline-flex items-center justify-center h-8 px-3
  bg-black/[0.04] dark:bg-white/[0.04] text-black/60 dark:text-white/60
  text-xs font-medium rounded-lg
  hover:bg-black/[0.08] dark:hover:bg-white/[0.08]
  hover:text-black/80 dark:hover:text-white/80
  active:bg-black/[0.12] dark:active:bg-white/[0.12]
  active:scale-95 transition-all duration-150
  disabled:opacity-30
`
  .replace(/\s+/g, " ")
  .trim()

// =============================================================================
// FORM ELEMENTS
// =============================================================================

/** Text input / textarea */
export const input = `
  w-full px-4 py-2.5
  bg-black/[0.02] dark:bg-white/[0.02]
  border border-black/[0.08] dark:border-white/[0.08]
  rounded-xl text-sm text-black dark:text-white
  placeholder:text-black/30 dark:placeholder:text-white/30
  focus:outline-none focus:ring-2 focus:ring-black/[0.12] dark:focus:ring-white/[0.12]
  focus:border-black/[0.12] dark:focus:border-white/[0.12]
  transition-all duration-150
`
  .replace(/\s+/g, " ")
  .trim()

/** Select dropdown */
export const select = `
  w-full px-4 py-2.5
  bg-black/[0.02] dark:bg-white/[0.02]
  border border-black/[0.08] dark:border-white/[0.08]
  rounded-xl text-sm text-black dark:text-white
  focus:outline-none focus:ring-2 focus:ring-black/[0.12] dark:focus:ring-white/[0.12]
  focus:border-black/[0.12] dark:focus:border-white/[0.12]
  transition-all duration-150
  disabled:opacity-40 disabled:cursor-not-allowed
`
  .replace(/\s+/g, " ")
  .trim()

/** Read-only display field */
export const readOnlyField = `
  w-full px-4 py-2.5
  bg-black/[0.03] dark:bg-white/[0.03]
  border border-black/[0.06] dark:border-white/[0.06]
  rounded-xl text-sm text-black/80 dark:text-white/80
`
  .replace(/\s+/g, " ")
  .trim()

// =============================================================================
// CONTAINERS & CARDS
// =============================================================================

/** Info card (tips, notices) */
export const infoCard = `
  p-4 rounded-xl
  bg-black/[0.02] dark:bg-white/[0.02]
  border border-black/[0.06] dark:border-white/[0.06]
`
  .replace(/\s+/g, " ")
  .trim()

/** Warning card (low credits, etc) */
export const warningCard = `
  p-4 rounded-xl
  bg-amber-500/5 dark:bg-amber-500/5
  border border-amber-500/20 dark:border-amber-500/20
`
  .replace(/\s+/g, " ")
  .trim()

/** Section divider */
export const sectionDivider = `
  pt-5 mt-5 border-t border-black/[0.06] dark:border-white/[0.06]
`
  .replace(/\s+/g, " ")
  .trim()

// =============================================================================
// SELECTION CARDS (theme picker, etc)
// =============================================================================

/** Selection card - base */
export const selectionCardBase = `
  flex flex-col items-center justify-center gap-2 p-4
  min-h-[88px] rounded-xl
  border border-black/[0.08] dark:border-white/[0.08]
  transition-all duration-150 active:scale-[0.98]
`
  .replace(/\s+/g, " ")
  .trim()

/** Selection card - inactive */
export const selectionCardInactive = `
  ${selectionCardBase}
  bg-black/[0.02] dark:bg-white/[0.02]
  hover:bg-black/[0.04] dark:hover:bg-white/[0.04]
  hover:border-black/[0.12] dark:hover:border-white/[0.12]
`
  .replace(/\s+/g, " ")
  .trim()

/** Selection card - active */
export const selectionCardActive = `
  ${selectionCardBase}
  bg-black/[0.06] dark:bg-white/[0.06]
  border-black/30 dark:border-white/30
  ring-1 ring-black/10 dark:ring-white/10
`
  .replace(/\s+/g, " ")
  .trim()

// =============================================================================
// TEXT STYLES
// =============================================================================

export const text = {
  /** Section label */
  label: "text-sm font-medium text-black/90 dark:text-white/90",
  /** Helper/description text */
  description: "text-xs text-black/50 dark:text-white/50",
  /** Muted secondary text */
  muted: "text-xs text-black/40 dark:text-white/40",
  /** Success message */
  success: "text-xs text-emerald-600 dark:text-emerald-400",
  /** Error message */
  error: "text-xs text-red-600 dark:text-red-400",
} as const
