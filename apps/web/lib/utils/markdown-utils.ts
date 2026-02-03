/**
 * Markdown detection and parsing utilities
 */

/**
 * Check if text contains markdown syntax
 */
export const hasMarkdown = (text: string): boolean => {
  if (!text) return false

  const patterns = [
    /^#{1,6}\s/m, // Headers
    /```[\s\S]*?```/, // Code blocks
    /`[^`]+`/, // Inline code
    /\*\*[^*]+\*\*/, // Bold
    /__[^_]+__/, // Bold (alt)
    /\*[^*]+\*/, // Italic
    /_[^_]+_/, // Italic (alt)
    /^\s*[-*+]\s/m, // Unordered lists
    /^\s*\d+\.\s/m, // Ordered lists
    /\[.+?\]\(.+?\)/, // Links
    /!\[.*?\]\(.+?\)/, // Images
    /^>\s/m, // Blockquotes
    /^\s*[-*_]{3,}\s*$/m, // Horizontal rules
    /~~[^~]+~~/, // Strikethrough
  ]

  return patterns.some(pattern => pattern.test(text))
}

/**
 * Check if text contains code blocks
 */
export const hasCodeBlock = (text: string): boolean => {
  return /```[\s\S]*?```/.test(text)
}
