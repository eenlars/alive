/**
 * Display-only exports
 *
 * This entry point exports only display-related utilities.
 * Safe to import in browser environments (no Node.js dependencies).
 *
 * @example
 * ```typescript
 * import { LINEAR, getDisplayConfig, shouldAutoExpand } from "@webalive/tools/display"
 * ```
 */

export type { ToolDisplayConfig } from "./display-config.js"
// Display configuration
export {
  getDisplayConfig,
  getPreview,
  isVisibleInNormalMode,
  plural,
  registerDisplayConfig,
  shouldAutoExpand,
  transformData,
  unwrapMcp,
} from "./display-config.js"
export type {
  AITool,
  EmailTool,
  FileOpTool,
  LinearTool,
  OtherTool,
  PlanTool,
  StripeTool,
  ToolName,
} from "./tool-names.js"
// Tool name constants
export { AI, EMAIL, FILE_OPS, LINEAR, OTHER, PLAN, STRIPE } from "./tool-names.js"
