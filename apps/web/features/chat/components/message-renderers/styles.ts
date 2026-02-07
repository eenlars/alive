/**
 * Shared Tailwind styles for message renderers
 *
 * Design tokens for consistent chat UI:
 * - Muted text: 40% opacity (secondary info)
 * - Hover text: 60% opacity (interactive feedback)
 * - Subtle text: 25-35% opacity (tertiary info)
 * - Icon size: 12px with 60% opacity
 */

/** Muted text for secondary information */
export const mutedText = "text-black/40 dark:text-white/40"

/** Semi-visible text for debug/system info */
export const semiVisibleText = "text-black/60 dark:text-white/60"

/** Interactive text with hover state */
export const interactiveText = "text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60"

/** Subtle text for tertiary information */
export const subtleText = "text-black/25 dark:text-white/25"

/** Error text styling */
export const errorText = "text-red-600 dark:text-red-400"

/** Error text with hover */
export const errorInteractiveText = "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"

/** Tool indicator button base styles */
export const toolIndicatorButton = "flex items-center gap-1.5 text-xs font-normal transition-colors"

/** Muted icon opacity */
export const mutedIcon = "opacity-60"

/** Standard icon props for tool indicators */
export const ICON_SIZE = 12

/** Inline code/mono text */
export const monoText = "font-diatype-mono"

/** Filled background for chips/containers */
export const filledBg = "bg-black/[0.04] dark:bg-white/[0.06]"

/** Standard rounding for containers */
export const roundedContainer = "rounded-xl"

/** Code block styling - minimal, no border */
export const codeBlock =
  "text-xs text-black/50 dark:text-white/50 font-diatype-mono leading-relaxed overflow-auto max-h-60 p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04]"
