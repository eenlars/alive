/**
 * Display-only exports
 *
 * This entry point exports only display-related utilities.
 * Safe to import in browser environments (no Node.js dependencies).
 *
 * @example
 * ```typescript
 * import { LINEAR, getDisplayConfig, shouldAutoExpand } from "@alive-brug/tools/display"
 * ```
 */

// Tool name constants
export { LINEAR, STRIPE, FILE_OPS, OTHER, EMAIL, AI, PLAN } from "./tool-names.js"
export type {
  LinearTool,
  StripeTool,
  FileOpTool,
  OtherTool,
  EmailTool,
  AITool,
  PlanTool,
  ToolName,
} from "./tool-names.js"

// Display configuration
export {
  getDisplayConfig,
  shouldAutoExpand,
  isVisibleInNormalMode,
  getPreview,
  transformData,
  registerDisplayConfig,
  unwrapMcp,
  plural,
} from "./display-config.js"
export type { ToolDisplayConfig } from "./display-config.js"
