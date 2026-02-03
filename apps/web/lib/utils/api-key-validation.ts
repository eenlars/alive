/**
 * API key validation utilities
 */

export function validateApiKey(key: string): { valid: boolean; error?: string } {
  if (!key || key.trim() === "") {
    return { valid: false, error: "API key cannot be empty" }
  }

  if (!key.startsWith("sk-ant-")) {
    return { valid: false, error: "Invalid API key format. Must start with 'sk-ant-'" }
  }

  return { valid: true }
}
