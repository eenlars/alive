/**
 * Tool Registry (React Extension)
 *
 * Extends @alive-brug/tools display config with React components.
 * Base display logic (autoExpand, preview, transform) comes from the package.
 *
 * @example
 * ```typescript
 * import { registerComponent, getToolRenderer } from "@/lib/tools/tool-registry"
 *
 * // Register a React component for a tool
 * registerComponent("mcp__linear__create_issue", LinearIssueResult, validateLinearIssue)
 *
 * // Get the renderer
 * const Renderer = getToolRenderer("mcp__linear__create_issue")
 * ```
 */

import type { ToolDisplayConfig, ToolName } from "@alive-brug/tools/display"

// Import from the shared package (display-only, browser-safe)
import {
  AI,
  EMAIL,
  FILE_OPS,
  getDisplayConfig,
  getPreview,
  isVisibleInNormalMode,
  LINEAR,
  OTHER,
  PLAN,
  plural,
  STRIPE,
  shouldAutoExpand,
  transformData,
  unwrapMcp,
} from "@alive-brug/tools/display"
import type { ComponentType } from "react"

// Re-export for consumers
export {
  LINEAR,
  STRIPE,
  FILE_OPS,
  OTHER,
  EMAIL,
  AI,
  PLAN,
  getDisplayConfig,
  shouldAutoExpand,
  isVisibleInNormalMode,
  getPreview,
  transformData,
  unwrapMcp,
  plural,
}

export type { ToolDisplayConfig, ToolName }

/**
 * Props passed to tool result renderer components
 */
export interface ToolResultRendererProps<T = unknown> {
  data: T
  toolName: string
  isError?: boolean
  toolInput?: unknown
  /** Callback to send a message to the chat (for interactive tools like clarification questions) */
  onSubmitAnswer?: (message: string) => void
}

/**
 * Component registration for a tool
 */
interface ComponentConfig {
  component: ComponentType<ToolResultRendererProps>
  validate?: (data: unknown) => boolean
}

// React component registry (separate from display config)
const componentRegistry = new Map<string, ComponentConfig>()

/**
 * Register a React component for a tool
 *
 * @param toolName - Tool name (case-insensitive)
 * @param component - React component to render results
 * @param validate - Optional validator to check if data is suitable
 */
export function registerComponent<T>(
  toolName: string,
  component: ComponentType<ToolResultRendererProps<T>>,
  validate?: (data: unknown) => boolean,
): void {
  componentRegistry.set(toolName.toLowerCase(), {
    component: component as ComponentType<ToolResultRendererProps>,
    validate,
  })
}

/**
 * Get the renderer component for a tool (if any)
 */
export function getToolRenderer(toolName: string): ComponentType<ToolResultRendererProps> | null {
  const config = componentRegistry.get(toolName.toLowerCase())
  return config?.component ?? null
}

/**
 * Validate data for a tool's renderer
 */
export function validateToolData(toolName: string, data: unknown): boolean {
  const config = componentRegistry.get(toolName.toLowerCase())
  if (!config?.validate) return true
  return config.validate(data)
}

// Backwards compatibility aliases
export const getToolConfig = getDisplayConfig
export const transformToolData = transformData
export const getToolPreview = getPreview
