/**
 * File type color mapping
 * Single source of truth for file icon colors
 */

import { getExtension } from "./file-path"

const FILE_TYPE_COLORS: Record<string, string> = {
  // TypeScript/JavaScript
  ts: "text-sky-400",
  tsx: "text-sky-400",
  js: "text-amber-400",
  jsx: "text-amber-400",
  mjs: "text-amber-400",
  // Data
  json: "text-amber-300/70",
  yaml: "text-rose-300/70",
  yml: "text-rose-300/70",
  // Styles
  css: "text-sky-300",
  scss: "text-pink-300",
  // Markup
  html: "text-orange-300",
  md: "text-neutral-400",
  mdx: "text-neutral-400",
  // Images
  svg: "text-emerald-400",
  png: "text-violet-400/70",
  jpg: "text-violet-400/70",
  jpeg: "text-violet-400/70",
  webp: "text-violet-400/70",
  // Config
  toml: "text-neutral-500",
  lock: "text-neutral-600",
}

const DEFAULT_COLOR = "text-neutral-500"

export function getFileColor(filename: string): string {
  const ext = getExtension(filename)
  return FILE_TYPE_COLORS[ext] || DEFAULT_COLOR
}
