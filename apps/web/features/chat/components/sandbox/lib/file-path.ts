/**
 * File path utilities
 * Eliminates primitive obsession - path manipulation in one place
 */

export function getParentPath(filePath: string): string {
  if (!filePath.includes("/")) return ""
  return filePath.split("/").slice(0, -1).join("/")
}

export function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath
}

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || ""
}

export function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean)
}

export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join("/")
}

export function canNavigateUp(path: string): boolean {
  return Boolean(path && path !== "/" && path !== ".")
}

export function navigateUp(path: string): string {
  if (!canNavigateUp(path)) return ""
  const parts = splitPath(path)
  parts.pop()
  return parts.length > 0 ? parts.join("/") : ""
}
