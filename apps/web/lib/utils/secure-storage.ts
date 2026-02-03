/**
 * Base64-obfuscated localStorage for API keys
 *
 * Security: This is NOT encryption. XSS attacks can still access the key.
 * Purpose: Prevent casual viewing in dev tools, persist across sessions.
 */

function obfuscate(data: string): string {
  return `obf_${btoa(data)}`
}

function deobfuscate(data: string): string {
  if (!data.startsWith("obf_")) {
    throw new Error("Invalid data format")
  }
  return atob(data.slice(4))
}

export const secureStorage = {
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return

    try {
      const obfuscated = obfuscate(value)
      localStorage.setItem(key, obfuscated)
    } catch (error) {
      console.error("Failed to store data:", error)
      throw new Error("Storage failed")
    }
  },

  getItem(key: string): string | null {
    if (typeof window === "undefined") return null

    try {
      const stored = localStorage.getItem(key)
      if (!stored) return null

      return deobfuscate(stored)
    } catch (error) {
      console.error("Failed to retrieve data:", error)
      localStorage.removeItem(key)
      return null
    }
  },

  removeItem(key: string): void {
    if (typeof window === "undefined") return
    localStorage.removeItem(key)
  },

  hasItem(key: string): boolean {
    if (typeof window === "undefined") return false
    return localStorage.getItem(key) !== null
  },
}
