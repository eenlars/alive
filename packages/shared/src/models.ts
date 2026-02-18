/**
 * Claude Models Configuration
 *
 * SINGLE SOURCE OF TRUTH for Claude model definitions.
 * All packages should import from here.
 */

/**
 * Available Claude models with short names (no version dates)
 */
export const CLAUDE_MODELS = {
  OPUS_4_6: "claude-opus-4-6",
  SONNET_4_6: "claude-sonnet-4-6",
  HAIKU_4_5: "claude-haiku-4-5",
} as const

export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS]

/**
 * Default model used for credit users and as initial state
 */
export const DEFAULT_CLAUDE_MODEL: ClaudeModel = CLAUDE_MODELS.SONNET_4_6

/**
 * Set of valid model strings for runtime validation
 */
const VALID_MODELS = new Set<string>(Object.values(CLAUDE_MODELS))

/**
 * Type guard to check if a value is a valid Claude model
 */
export function isValidClaudeModel(value: unknown): value is ClaudeModel {
  return typeof value === "string" && VALID_MODELS.has(value)
}

/**
 * Get human-readable display name for a model
 */
export function getModelDisplayName(model: ClaudeModel): string {
  switch (model) {
    case CLAUDE_MODELS.OPUS_4_6:
      return "Claude Opus 4.6"
    case CLAUDE_MODELS.SONNET_4_6:
      return "Claude Sonnet 4.6"
    case CLAUDE_MODELS.HAIKU_4_5:
      return "Claude Haiku 4.5"
    default:
      return model
  }
}
