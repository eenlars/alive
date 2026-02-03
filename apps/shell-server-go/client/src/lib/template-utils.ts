// Shared utilities for template complexity display

export function getComplexityLabel(complexity: number | string): string {
  const c = typeof complexity === "string" ? parseInt(complexity, 10) : complexity
  switch (c) {
    case 1:
      return "Simple"
    case 2:
      return "Medium"
    case 3:
      return "Complex"
    default:
      return String(complexity)
  }
}

export function getComplexityColor(complexity: number | string): string {
  const c = typeof complexity === "string" ? parseInt(complexity, 10) : complexity
  switch (c) {
    case 1:
      return "text-green-400"
    case 2:
      return "text-yellow-400"
    case 3:
      return "text-red-400"
    default:
      return "text-shell-text-muted"
  }
}

// Parse YAML frontmatter from markdown content
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
  if (!content.startsWith("---")) {
    return { frontmatter: null, body: content }
  }

  const endIndex = content.indexOf("---", 3)
  if (endIndex === -1) {
    return { frontmatter: null, body: content }
  }

  const frontmatterStr = content.slice(3, endIndex).trim()
  const body = content.slice(endIndex + 3).trim()

  const frontmatter: Record<string, unknown> = {}
  let currentKey = ""
  let currentArray: string[] | null = null

  for (const line of frontmatterStr.split("\n")) {
    // Array item
    if (line.trim().startsWith("- ") && currentArray !== null) {
      const value = line
        .trim()
        .slice(2)
        .replace(/^["']|["']$/g, "")
      currentArray.push(value)
      continue
    }

    // Key-value pair
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue

    // Save previous array if exists
    if (currentArray !== null && currentKey) {
      frontmatter[currentKey] = currentArray
      currentArray = null
    }

    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()

    // Inline array [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map(v => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
      currentKey = ""
    }
    // Start of multi-line array
    else if (value === "") {
      currentKey = key
      currentArray = []
    }
    // Simple value
    else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "")
      currentKey = ""
    }
  }

  // Save final array if exists
  if (currentArray !== null && currentKey) {
    frontmatter[currentKey] = currentArray
  }

  return { frontmatter, body }
}
