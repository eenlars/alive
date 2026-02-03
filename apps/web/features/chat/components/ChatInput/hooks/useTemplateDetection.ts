import { useEffect, useRef } from "react"
import type { Attachment } from "../types"
import { isSuperTemplateAttachment } from "../types"

interface SuperTemplateJSON {
  type: "supertemplate"
  id: string
  name: string
  preview: string
}

function isValidSuperTemplateJSON(obj: unknown): obj is SuperTemplateJSON {
  if (typeof obj !== "object" || obj === null) return false
  const t = obj as Record<string, unknown>
  return (
    t.type === "supertemplate" &&
    typeof t.id === "string" &&
    t.id.length > 0 &&
    typeof t.name === "string" &&
    t.name.length > 0 &&
    typeof t.preview === "string" &&
    t.preview.length > 0
  )
}

/**
 * Detects supertemplate JSON in message text and converts to attachments
 *
 * Pattern: {"type":"supertemplate","id":"...","name":"...","preview":"..."}
 * Debounced to 300ms to avoid client overload
 */
export function useSuperTemplateDetection(
  message: string,
  setMessage: (msg: string) => void,
  attachments: Attachment[],
  addSuperTemplateAttachment: (templateId: string, name: string, preview: string) => void,
) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Performance: Skip detection for very long messages
    if (message.length > 50000) return

    // Set new debounced timer
    debounceTimerRef.current = setTimeout(() => {
      // Regex to find supertemplate JSON objects (order-independent)
      // Matches any JSON object containing "type":"supertemplate" regardless of property order
      const jsonRegex = /\{[^}]*"type"\s*:\s*"supertemplate"[^}]*\}/g
      const matches = message.match(jsonRegex)

      if (!matches || matches.length === 0) return

      // Get existing template IDs to prevent duplicates (type-safe)
      const existingTemplateIds = new Set(attachments.filter(isSuperTemplateAttachment).map(a => a.templateId))

      let updatedMessage = message
      let hasChanges = false

      for (const jsonStr of matches) {
        try {
          const parsed = JSON.parse(jsonStr)

          if (isValidSuperTemplateJSON(parsed)) {
            // Skip if already exists
            if (existingTemplateIds.has(parsed.id)) {
              // Still remove from message even if duplicate
              updatedMessage = updatedMessage.replace(jsonStr, "")
              hasChanges = true
              continue
            }

            // Add new supertemplate attachment
            addSuperTemplateAttachment(parsed.id, parsed.name, parsed.preview)
            existingTemplateIds.add(parsed.id)

            // Remove JSON from message
            updatedMessage = updatedMessage.replace(jsonStr, "")
            hasChanges = true
          }
        } catch (error) {
          // Invalid JSON - ignore and leave as text
          console.warn("Failed to parse supertemplate JSON:", error)
        }
      }

      // Update message if we removed any JSON (preserve whitespace/newlines)
      if (hasChanges) {
        setMessage(updatedMessage.trim())
      }
    }, 300) // 300ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [message, attachments, setMessage, addSuperTemplateAttachment])
}
