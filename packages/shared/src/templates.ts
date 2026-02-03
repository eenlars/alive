/**
 * Website Templates - Single Source of Truth
 *
 * All template definitions live here. Import from this file
 * instead of duplicating template arrays elsewhere.
 *
 * Used by:
 * - ask-website-config tool (MCP)
 * - create-website tool (MCP)
 * - WebsiteConfigPreview component
 * - tool-registry descriptions
 */

/**
 * Template icon types for UI rendering
 */
export type TemplateIcon = "blank" | "gallery" | "event" | "saas" | "business"

/**
 * Template definition
 */
export interface Template {
  /** Unique template ID (must start with "tmpl_") */
  id: string
  /** Human-readable name */
  name: string
  /** Short description */
  description: string
  /** Icon identifier for UI */
  icon: TemplateIcon
}

/**
 * All available website templates
 */
export const TEMPLATES: readonly Template[] = [
  {
    id: "tmpl_blank",
    name: "Blank Canvas",
    description: "Minimal starter - build from scratch",
    icon: "blank",
  },
  {
    id: "tmpl_gallery",
    name: "Photo Gallery",
    description: "Showcase images and portfolios",
    icon: "gallery",
  },
  {
    id: "tmpl_event",
    name: "Event Page",
    description: "Perfect for launches, parties, or announcements",
    icon: "event",
  },
  {
    id: "tmpl_saas",
    name: "SaaS Landing",
    description: "Modern product landing page",
    icon: "saas",
  },
  {
    id: "tmpl_business",
    name: "Business",
    description: "Professional company website",
    icon: "business",
  },
] as const

/**
 * Template IDs as a union type
 */
export type TemplateId = (typeof TEMPLATES)[number]["id"]

/**
 * Array of valid template IDs for validation
 */
export const TEMPLATE_IDS = TEMPLATES.map(t => t.id)

/**
 * Check if a string is a valid template ID
 */
export function isValidTemplateId(id: string): id is TemplateId {
  return TEMPLATE_IDS.includes(id)
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id)
}

/**
 * Generate template list for documentation/descriptions
 * Format: "- tmpl_blank: Minimal starter (default)\n- tmpl_gallery: ..."
 */
export function getTemplateListForDocs(defaultId?: string): string {
  return TEMPLATES.map(t => {
    const isDefault = t.id === defaultId
    return `- ${t.id}: ${t.name}${isDefault ? " (default)" : ""}`
  }).join("\n")
}

/**
 * Generate inline template list for tool descriptions
 * Format: "tmpl_blank, tmpl_gallery, tmpl_event, tmpl_saas, tmpl_business"
 */
export function getTemplateIdsInline(): string {
  return TEMPLATE_IDS.join(", ")
}
