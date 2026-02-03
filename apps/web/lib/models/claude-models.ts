/**
 * Claude model definitions and validation
 *
 * Re-exports from @webalive/shared - SINGLE SOURCE OF TRUTH
 */

import { CLAUDE_MODELS, type ClaudeModel, getModelDisplayName, isValidClaudeModel } from "@webalive/shared"

// Re-export everything from shared
export { CLAUDE_MODELS, isValidClaudeModel, getModelDisplayName, type ClaudeModel }

/**
 * Default model used for credit users and as initial state
 * Note: Web app uses HAIKU as default for cost efficiency
 */
export const DEFAULT_MODEL: ClaudeModel = CLAUDE_MODELS.HAIKU_4_5
