/**
 * Template types for Super Templates UI
 * Types only - no runtime imports to avoid Node.js deps in client bundles
 */

import type { TemplateCategory, TemplateListItem } from "@alive-brug/tools"

// Re-export types for component usage
export type { TemplateListItem, TemplateCategory }

/**
 * Template alias for backwards compatibility with legacy components
 * TemplateListItem has same structure as old Template type
 */
export type Template = TemplateListItem

/**
 * Template categories with display names (for UI)
 * Duplicated here to avoid importing from @alive-brug/tools which has Node.js deps
 */
export const TEMPLATE_CATEGORIES: Record<string, string> = {
  "ui-components": "UI Components",
  forms: "Forms",
  "data-display": "Data Display",
  navigation: "Navigation",
  media: "Media",
  layout: "Layout",
  integrations: "Integrations",
  animations: "Animations",
  landing: "Landing",
  maps: "Maps",
  backend: "Backend",
  setup: "Setup",
  frontend: "Frontend",
  "content-management": "Content Management",
  "photo-sliders": "Photo Sliders",
  components: "Components",
  "forms-and-inputs": "Forms & Inputs",
  other: "Other",
}
