import { useEffect, useState } from "react"
import {
  listTemplates,
  getTemplate,
  createTemplate,
  type TemplateListItem,
  type ValidationError,
} from "../../api/templates"
import { getComplexityColor, getComplexityLabel } from "../../lib/template-utils"
import { useEditorStore } from "../../store/editor"

// Default markdown body content
const DEFAULT_BODY = `# My Template

Description of what this template builds.

## Step-by-Step Implementation

### Step 1: Install Dependencies

\`\`\`bash
bun add package-name
\`\`\`

### Step 2: Create the Component

Create \`src/components/ComponentName.tsx\`:

\`\`\`tsx
// Component code here
\`\`\`

### Step 3: Use in Your Page

Update your page to use the component.

## How It Works

Explain the key concepts.

## Customization

Show common customization examples.
`

// Categories for the dropdown
const CATEGORIES = [
  "ui-components",
  "forms",
  "data-display",
  "navigation",
  "media",
  "layout",
  "integrations",
  "animations",
  "other",
]

// Generate random hex string
function randomHex(length: number): string {
  const chars = "0123456789abcdef"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

// Generate random template name
function generateRandomName(): string {
  const adjectives = ["Awesome", "Modern", "Simple", "Dynamic", "Elegant", "Sleek", "Responsive", "Interactive"]
  const nouns = ["Component", "Widget", "Section", "Module", "Layout", "Card", "Panel", "Block"]
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj} ${noun} ${randomHex(4)}`
}

// Generate random description
function generateRandomDescription(): string {
  const templates = [
    "A reusable component for building modern interfaces",
    "Clean and minimal implementation ready to customize",
    "Plug-and-play solution for common UI patterns",
    "Lightweight and performant component template",
  ]
  return templates[Math.floor(Math.random() * templates.length)]
}

// Generate initial form data with random defaults
function generateInitialFormData(): FormData {
  return {
    name: generateRandomName(),
    description: generateRandomDescription(),
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    body: DEFAULT_BODY,
  }
}

interface FormData {
  name: string
  description: string
  category: string
  body: string
}

interface TemplatesPanelProps {
  onInsertTemplate: (content: string) => void
}

export function TemplatesPanel({ onInsertTemplate }: TemplatesPanelProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [formData, setFormData] = useState<FormData>(generateInitialFormData)
  const [creating, setCreating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [errorMessage, setErrorMessage] = useState("")

  const openTab = useEditorStore(s => s.openTab)
  const openTabs = useEditorStore(s => s.openTabs)
  const setActiveTab = useEditorStore(s => s.setActiveTab)

  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    setLoading(true)
    setError("")
    try {
      const result = await listTemplates()
      if (result.error) {
        setError(result.error)
      } else {
        setTemplates(result.templates || [])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectTemplate(template: TemplateListItem) {
    const templatePath = `template:${template.id}`

    const existing = openTabs.find(t => t.path === templatePath)
    if (existing) {
      setActiveTab(templatePath)
      return
    }

    setLoadingTemplateId(template.id)
    try {
      const result = await getTemplate(template.id)
      if (result.error) {
        setError(result.error)
      } else {
        openTab(templatePath, `${template.name}.md`, result.content, 0, {
          isTemplate: true,
          templateId: template.id,
        })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingTemplateId(null)
    }
  }

  function resetDialog() {
    setFormData(generateInitialFormData())
    setErrorMessage("")
    setValidationErrors([])
  }

  // Build full content with frontmatter from form data
  function buildContent(): string {
    const { name, description, category, body } = formData
    return `---
name: ${name}
description: ${description}
category: ${category}
---

${body}`
  }

  async function handleCreateTemplate() {
    if (!formData.name.trim()) {
      setErrorMessage("Name is required")
      return
    }
    if (!formData.description.trim()) {
      setErrorMessage("Description is required")
      return
    }

    setCreating(true)
    setErrorMessage("")
    setValidationErrors([])

    try {
      const content = buildContent()
      const result = await createTemplate({
        name: "", // Auto-generated by backend from frontmatter
        category: "", // Auto-generated by backend from frontmatter
        content: content,
      })
      if (result.error) {
        if (result.validationErrors && result.validationErrors.length > 0) {
          setValidationErrors(result.validationErrors)
          setErrorMessage(result.message || "Validation failed")
        } else {
          setErrorMessage(result.error)
        }
      } else {
        const templateId = result.id

        resetDialog()
        setShowDialog(false)

        await loadTemplates()

        if (templateId) {
          const templateResult = await getTemplate(templateId)
          if (!templateResult.error && templateResult.content) {
            openTab(`template:${templateId}`, `${templateId}.md`, templateResult.content, 0, {
              isTemplate: true,
              templateId: templateId,
            })
          }
        }
      }
    } catch (err) {
      setErrorMessage((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const filteredTemplates = templates.filter(t => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const tags = t.tags || []
    return (
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      tags.some(tag => tag.toLowerCase().includes(query))
    )
  })

  const groupedTemplates = filteredTemplates.reduce(
    (acc, template) => {
      const category = template.category || "other"
      if (!acc[category]) acc[category] = []
      acc[category].push(template)
      return acc
    },
    {} as Record<string, TemplateListItem[]>,
  )

  if (loading) {
    return <div className="p-4 text-shell-text-muted text-sm">Loading templates...</div>
  }

  if (error && !showDialog) {
    return (
      <div className="p-4">
        <div className="text-red-400 text-sm mb-2">{error}</div>
        <button
          type="button"
          onClick={() => {
            setError("")
            loadTemplates()
          }}
          className="bg-shell-accent hover:bg-shell-accent-hover text-white border-none rounded px-3 py-1.5 text-xs cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Dialog overlay */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-shell-surface border border-shell-border rounded-lg w-[700px] max-w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-shell-border shrink-0">
              <h2 className="text-white text-lg font-semibold">New Super Template</h2>
              <p className="text-shell-text-muted text-xs mt-1">
                Paste your template content below. Only <code className="text-shell-accent">name</code> and{" "}
                <code className="text-shell-accent">description</code> are required in frontmatter - everything else is
                auto-filled.
              </p>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Error messages */}
              {errorMessage && (
                <div className="text-red-400 text-sm p-2 bg-red-500/10 border border-red-500/30 rounded">
                  {errorMessage}
                </div>
              )}
              {validationErrors.length > 0 && (
                <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                  <div className="text-yellow-400 text-xs font-semibold mb-1">Validation errors:</div>
                  <ul className="text-yellow-300 text-xs space-y-0.5 list-disc list-inside">
                    {validationErrors.map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">{e.field}</span>: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Name field */}
              <div>
                <label className="block text-shell-text-muted text-xs mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-shell-bg border border-shell-border rounded px-3 py-2 text-white text-sm placeholder-shell-text-muted focus:outline-none focus:border-shell-accent"
                  placeholder="e.g., Image Carousel with Thumbnails"
                />
                <p className="text-shell-text-muted text-xs mt-1">Filename will be auto-generated from the name</p>
              </div>

              {/* Description field */}
              <div>
                <label className="block text-shell-text-muted text-xs mb-1">
                  Description <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-shell-bg border border-shell-border rounded px-3 py-2 text-white text-sm placeholder-shell-text-muted focus:outline-none focus:border-shell-accent"
                  placeholder="Brief description of what this template does"
                />
              </div>

              {/* Category dropdown */}
              <div>
                <label className="block text-shell-text-muted text-xs mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-shell-bg border border-shell-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-shell-accent"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              {/* Content/body field */}
              <div className="flex-1">
                <label className="block text-shell-text-muted text-xs mb-1">Content (Markdown)</label>
                <textarea
                  value={formData.body}
                  onChange={e => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  className="w-full bg-shell-bg border border-shell-border rounded px-3 py-2 text-white text-sm placeholder-shell-text-muted focus:outline-none focus:border-shell-accent font-mono min-h-[250px]"
                  placeholder="# Template Title&#10;&#10;Description and implementation steps..."
                />
              </div>

              {/* Auto-generated info */}
              <div className="text-shell-text-muted text-xs p-2 bg-shell-bg/50 rounded border border-shell-border/50">
                <strong>Auto-generated:</strong> complexity, files count, estimated time, and other metadata will be
                filled automatically.
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-shell-border shrink-0 flex gap-3 justify-between items-center">
              <button
                type="button"
                onClick={resetDialog}
                className="text-xs text-shell-text-muted hover:text-white cursor-pointer bg-transparent border-none"
              >
                Reset to default
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDialog(false)
                    resetDialog()
                  }}
                  className="px-4 py-2 text-shell-text-muted hover:text-white border-none bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateTemplate}
                  disabled={creating || !formData.name.trim() || !formData.description.trim()}
                  className="bg-shell-accent hover:bg-shell-accent-hover disabled:opacity-50 text-white border-none rounded px-4 py-2 cursor-pointer"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 border-b border-shell-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-shell-accent text-sm font-semibold m-0">Super Templates</h3>
          <button
            type="button"
            onClick={() => setShowDialog(true)}
            className="bg-shell-accent hover:bg-shell-accent-hover text-white border-none rounded px-2 py-1 text-xs cursor-pointer"
          >
            + New
          </button>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search templates..."
          className="w-full bg-shell-bg border border-shell-border rounded px-2 py-1.5 text-sm text-white placeholder-shell-text-muted focus:outline-none focus:border-shell-accent"
        />
      </div>

      <div className="flex-1 overflow-auto p-2 min-h-0">
        {Object.keys(groupedTemplates).length === 0 ? (
          <div className="text-shell-text-muted text-sm text-center py-4">
            {searchQuery ? "No templates match your search" : "No templates available"}
          </div>
        ) : (
          Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category} className="mb-4">
              <h4 className="text-shell-text-muted text-xs uppercase tracking-wide mb-2 px-2">{category}</h4>
              {categoryTemplates.map(template => {
                const isLoading = loadingTemplateId === template.id
                const isOpen = openTabs.some(t => t.path === `template:${template.id}`)
                return (
                  <div
                    key={template.id}
                    onClick={() => !isLoading && handleSelectTemplate(template)}
                    className={`p-2 rounded cursor-pointer transition-colors mb-1 ${
                      isOpen ? "bg-shell-surface border-l-2 border-shell-accent" : "hover:bg-shell-surface"
                    } ${isLoading ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate flex items-center gap-2">
                          {template.name}
                          {isLoading && <span className="text-shell-text-muted text-xs">Loading...</span>}
                        </div>
                        <div className="text-shell-text-muted text-xs truncate mt-0.5">{template.description}</div>
                      </div>
                      <span className={`text-xs shrink-0 ${getComplexityColor(template.complexity)}`}>
                        {getComplexityLabel(template.complexity)}
                      </span>
                    </div>
                    {(template.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {template.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="bg-shell-border text-shell-text-muted px-1.5 py-0.5 rounded text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                        {template.tags.length > 3 && (
                          <span className="text-shell-text-muted text-xs">+{template.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
