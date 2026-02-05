"use client"

import type { AppDatabase } from "@webalive/database"
import { DEFAULTS, PATHS } from "@webalive/shared"
import { useDomainConfig } from "@/lib/providers/DomainConfigProvider"
import { useState } from "react"

type Template = AppDatabase["app"]["Tables"]["templates"]["Row"]

const TEMPLATE_PREFIX = DEFAULTS.TEMPLATE_ID_PREFIX
const SITES_ROOT_PATH = `${PATHS.SITES_ROOT}/`

const INPUT_BASE_CLASSES =
  "w-full px-3 py-2 text-sm border border-slate-300 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-slate-900 dark:text-white rounded focus:outline-none focus:ring-2"
const ADD_INPUT_CLASSES = `${INPUT_BASE_CLASSES} focus:ring-green-500`
const EDIT_INPUT_CLASSES = `${INPUT_BASE_CLASSES} focus:ring-indigo-500`

interface TemplatesListProps {
  templates: Template[]
  loading: boolean
  onRefresh: () => void
  onSave: (template: Partial<Template> & { template_id: string }) => Promise<void>
  onDelete: (templateId: string) => void
  onAdd: (template: Omit<Template, "template_id"> & { template_id?: string }) => Promise<void>
  saving: string | null
  deleting: string | null
}

export function TemplatesList({
  templates,
  loading,
  onRefresh,
  onSave,
  onDelete,
  onAdd,
  saving,
  deleting,
}: TemplatesListProps) {
  const { wildcard } = useDomainConfig()
  const EXAMPLE_DOMAIN = `gallery.${wildcard}`
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Template>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<Partial<Template>>({
    template_id: TEMPLATE_PREFIX,
    name: "",
    description: "",
    ai_description: "",
    source_path: SITES_ROOT_PATH,
    preview_url: "",
    image_url: "",
    is_active: true,
    deploy_count: 0,
  })
  const [addError, setAddError] = useState<string | null>(null)

  const startEdit = (template: Template) => {
    setEditingId(template.template_id)
    setEditForm({ ...template })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleSave = async () => {
    if (!editingId) return
    await onSave({ ...editForm, template_id: editingId })
    setEditingId(null)
    setEditForm({})
  }

  const handleAdd = async () => {
    setAddError(null)

    // Validate template_id prefix
    if (addForm.template_id && !addForm.template_id.startsWith(TEMPLATE_PREFIX)) {
      setAddError(`Template ID must start with '${TEMPLATE_PREFIX}'`)
      return
    }

    // Validate template_id has content after prefix
    if (!addForm.template_id || addForm.template_id === TEMPLATE_PREFIX) {
      setAddError(`Template ID is required (e.g., ${TEMPLATE_PREFIX}gallery)`)
      return
    }

    if (!addForm.name || !addForm.source_path) {
      setAddError("Name and source path are required")
      return
    }

    await onAdd({
      template_id: addForm.template_id,
      name: addForm.name,
      source_path: addForm.source_path,
      description: addForm.description ?? null,
      ai_description: addForm.ai_description ?? null,
      preview_url: addForm.preview_url ?? null,
      image_url: addForm.image_url ?? null,
      is_active: addForm.is_active ?? true,
      deploy_count: addForm.deploy_count ?? 0,
    })
    setShowAddForm(false)
    setAddForm({
      template_id: TEMPLATE_PREFIX,
      name: "",
      description: "",
      ai_description: "",
      source_path: SITES_ROOT_PATH,
      preview_url: "",
      image_url: "",
      is_active: true,
      deploy_count: 0,
    })
  }

  return (
    <>
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-green-700 bg-green-50 border border-green-300 rounded hover:bg-green-100 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900/40 transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-[#333] dark:text-slate-300 dark:border-white/20 dark:hover:bg-[#444] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Add Template Form */}
      {showAddForm && (
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-white/10 bg-green-50/50 dark:bg-green-950/20">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Add New Template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Template ID (e.g. {TEMPLATE_PREFIX}gallery)
              </span>
              <input
                type="text"
                value={addForm.template_id ?? ""}
                onChange={e => setAddForm(prev => ({ ...prev, template_id: e.target.value }))}
                placeholder={`${TEMPLATE_PREFIX}example`}
                className={ADD_INPUT_CLASSES}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</span>
              <input
                type="text"
                value={addForm.name ?? ""}
                onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Gallery"
                className={ADD_INPUT_CLASSES}
              />
            </label>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label
                  htmlFor="add-source-path"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Source Path *
                </label>
                <div className="group relative">
                  <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full cursor-help">
                    i
                  </span>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-[#333] border border-slate-200 dark:border-white/10 rounded shadow-lg z-10">
                    <p className="font-medium mb-1">How to add a template:</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Deploy a site with the desired template design</li>
                      <li>
                        Copy the site path (e.g., {SITES_ROOT_PATH}
                        {EXAMPLE_DOMAIN})
                      </li>
                      <li>Paste it here as the source path</li>
                    </ol>
                  </div>
                </div>
              </div>
              <input
                id="add-source-path"
                type="text"
                value={addForm.source_path ?? ""}
                onChange={e => setAddForm(prev => ({ ...prev, source_path: e.target.value }))}
                placeholder={`${SITES_ROOT_PATH}example.${wildcard}`}
                className={ADD_INPUT_CLASSES}
              />
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Preview URL</span>
              <input
                type="text"
                value={addForm.preview_url ?? ""}
                onChange={e => setAddForm(prev => ({ ...prev, preview_url: e.target.value }))}
                placeholder={`https://example.${wildcard}`}
                className={ADD_INPUT_CLASSES}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Image URL</span>
              <input
                type="text"
                value={addForm.image_url ?? ""}
                onChange={e => setAddForm(prev => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://..."
                className={ADD_INPUT_CLASSES}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description</span>
              <input
                type="text"
                value={addForm.description ?? ""}
                onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="A beautiful gallery template"
                className={ADD_INPUT_CLASSES}
              />
            </label>
            <label className="sm:col-span-2 block">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                AI Description (for matching)
              </span>
              <textarea
                value={addForm.ai_description ?? ""}
                onChange={e => setAddForm(prev => ({ ...prev, ai_description: e.target.value }))}
                placeholder="Detailed description for AI template matching..."
                rows={2}
                className={ADD_INPUT_CLASSES}
              />
            </label>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add-is-active"
                checked={addForm.is_active ?? true}
                onChange={e => setAddForm(prev => ({ ...prev, is_active: e.target.checked }))}
                className="rounded border-slate-300 dark:border-white/10"
              />
              <label htmlFor="add-is-active" className="text-xs text-slate-700 dark:text-slate-300">
                Active
              </label>
            </div>
          </div>
          {addError && (
            <div className="mb-4 px-3 py-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300 rounded border border-red-200 dark:border-red-800">
              {addError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!addForm.name || !addForm.source_path}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Template
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setAddError(null)
              }}
              className="text-xs px-3 py-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-[#333] dark:text-slate-300 dark:border-white/20 dark:hover:bg-[#444] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-200 dark:divide-white/10">
        {loading ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">No templates found</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Click "Add" to create one</p>
          </div>
        ) : (
          templates.map(template => (
            <div
              key={template.template_id}
              className="px-4 sm:px-6 py-4 sm:py-5 hover:bg-slate-50 dark:hover:bg-[#333]"
            >
              {editingId === template.template_id ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Name</span>
                      <input
                        type="text"
                        value={editForm.name ?? ""}
                        onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className={EDIT_INPUT_CLASSES}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Source Path
                      </span>
                      <input
                        type="text"
                        value={editForm.source_path ?? ""}
                        onChange={e => setEditForm(prev => ({ ...prev, source_path: e.target.value }))}
                        className={EDIT_INPUT_CLASSES}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Preview URL
                      </span>
                      <input
                        type="text"
                        value={editForm.preview_url ?? ""}
                        onChange={e => setEditForm(prev => ({ ...prev, preview_url: e.target.value }))}
                        className={EDIT_INPUT_CLASSES}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Image URL
                      </span>
                      <input
                        type="text"
                        value={editForm.image_url ?? ""}
                        onChange={e => setEditForm(prev => ({ ...prev, image_url: e.target.value }))}
                        className={EDIT_INPUT_CLASSES}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Description
                      </span>
                      <input
                        type="text"
                        value={editForm.description ?? ""}
                        onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        className={EDIT_INPUT_CLASSES}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Deploy Count
                      </span>
                      <input
                        type="number"
                        value={editForm.deploy_count ?? 0}
                        onChange={e =>
                          setEditForm(prev => ({ ...prev, deploy_count: parseInt(e.target.value, 10) || 0 }))
                        }
                        className={EDIT_INPUT_CLASSES}
                      />
                    </label>
                    <label className="sm:col-span-2 block">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        AI Description
                      </span>
                      <textarea
                        value={editForm.ai_description ?? ""}
                        onChange={e => setEditForm(prev => ({ ...prev, ai_description: e.target.value }))}
                        rows={2}
                        className={EDIT_INPUT_CLASSES}
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`edit-is-active-${template.template_id}`}
                        checked={editForm.is_active ?? true}
                        onChange={e => setEditForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        className="rounded border-slate-300 dark:border-white/10"
                      />
                      <label
                        htmlFor={`edit-is-active-${template.template_id}`}
                        className="text-xs text-slate-700 dark:text-slate-300"
                      >
                        Active
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving === template.template_id}
                      className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {saving === template.template_id ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-xs px-3 py-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-[#333] dark:text-slate-300 dark:border-white/20 dark:hover:bg-[#444] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-1 min-w-0">
                    {/* Image Preview */}
                    {template.image_url && (
                      <div className="w-20 h-14 sm:w-24 sm:h-16 rounded overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                        <img src={template.image_url} alt={template.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm sm:text-base text-slate-900 dark:text-white">
                          {template.name}
                        </h3>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-[100px] sm:max-w-none">
                          {template.template_id}
                        </span>
                        {!template.is_active && (
                          <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-1 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>Deploys: {template.deploy_count ?? 0}</span>
                        {template.preview_url && (
                          <a
                            href={template.preview_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            Preview
                          </a>
                        )}
                        <span
                          className="font-mono truncate max-w-[120px] sm:max-w-[200px]"
                          title={template.source_path}
                        >
                          {template.source_path}
                        </span>
                      </div>
                      {template.ai_description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic line-clamp-1 hidden sm:block">
                          AI: {template.ai_description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(template)}
                      className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/40 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(template.template_id)}
                      disabled={deleting === template.template_id}
                      className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {deleting === template.template_id ? "..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}
