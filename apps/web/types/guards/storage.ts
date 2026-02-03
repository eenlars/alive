/**
 * Storage-related type guards
 * Note: Model validation moved to @/lib/models/claude-models to avoid circular dependency
 */

export function hasModelProperty(value: unknown): value is { model: unknown } {
  return typeof value === "object" && value !== null && "model" in value
}
