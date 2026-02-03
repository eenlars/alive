"use client"

import { Globe, Sparkles } from "lucide-react"
import { useState } from "react"
import { PromptEditorModal } from "@/components/modals/PromptEditorModal"
import { MarkdownDisplay } from "@/components/ui/chat/format/MarkdownDisplay"
import { useGlobalSkills, useSkillsActions, useSkillsLoading, useUserSkills } from "@/lib/providers/SkillsStoreProvider"
import { SettingsTabLayout } from "./SettingsTabLayout"

export function UserPromptsSettings() {
  const globalSkills = useGlobalSkills()
  const userSkills = useUserSkills()
  const isLoading = useSkillsLoading()
  const { addUserSkill, updateUserSkill, removeUserSkill } = useSkillsActions()

  const [editorState, setEditorState] = useState<{
    mode: "add" | "edit"
    skillId?: string
    displayName: string
    data: string
  } | null>(null)

  const handleOpenEditor = (mode: "add" | "edit", skillId?: string, displayName = "", data = "") => {
    setEditorState({ mode, skillId, displayName, data })
  }

  const handleCloseEditor = () => {
    setEditorState(null)
  }

  const handleSaveSkill = (displayName: string, data: string) => {
    if (!editorState) return

    if (editorState.mode === "add") {
      addUserSkill({
        displayName,
        description: displayName,
        prompt: data,
      })
    } else if (editorState.mode === "edit" && editorState.skillId) {
      updateUserSkill(editorState.skillId, {
        displayName,
        description: displayName,
        prompt: data,
      })
    }

    setEditorState(null)
  }

  return (
    <SettingsTabLayout title="Skills" description="Global skills from the system and your custom skills">
      <div className="space-y-6">
        {/* Global Skills Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="size-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-black/80 dark:text-white/80">Global Skills</h3>
            {isLoading && <span className="text-xs text-black/40 dark:text-white/40">Loading...</span>}
          </div>

          {globalSkills.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {globalSkills.map(skill => (
                <div
                  key={skill.id}
                  className="px-4 py-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/50 to-cyan-50/50 dark:from-blue-950/20 dark:to-cyan-950/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="size-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">{skill.displayName}</span>
                  </div>
                  <div className="text-xs text-black/60 dark:text-white/60 mb-2">{skill.description}</div>
                  <div className="text-xs text-black/50 dark:text-white/50 line-clamp-3 overflow-hidden">
                    <MarkdownDisplay content={skill.prompt.slice(0, 200) + (skill.prompt.length > 200 ? "..." : "")} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !isLoading && (
              <div className="text-sm text-black/40 dark:text-white/40 py-4">No global skills available.</div>
            )
          )}
        </div>

        {/* User Skills Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-sm font-semibold text-black/80 dark:text-white/80">Your Custom Skills</h3>
          </div>

          {/* Add New Skill Button */}
          <button
            type="button"
            onClick={() => handleOpenEditor("add")}
            className="w-full mb-4 px-4 py-3 sm:py-2.5 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg text-sm font-medium text-purple-600 dark:text-purple-400 hover:border-purple-500 dark:hover:border-purple-500 hover:text-purple-700 dark:hover:text-purple-300 active:scale-[0.99] transition-all"
          >
            + Add Custom Skill
          </button>

          {userSkills.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {userSkills.map(skill => (
                <div
                  key={skill.id}
                  className="px-4 py-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-950/20 dark:to-pink-950/20"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-3.5 text-purple-600 dark:text-purple-400" />
                      <span className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                        {skill.displayName}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditor("edit", skill.id, skill.displayName, skill.prompt)}
                        className="px-2 py-1 text-xs text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeUserSkill(skill.id)}
                        className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-black/70 dark:text-white/70 line-clamp-4 overflow-hidden">
                    <MarkdownDisplay content={skill.prompt} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-black/40 dark:text-white/40 text-sm">
              No custom skills yet. Click &quot;Add Custom Skill&quot; to create one.
            </div>
          )}
        </div>

        {/* Skill Editor Modal */}
        {editorState && (
          <PromptEditorModal
            mode={editorState.mode}
            initialDisplayName={editorState.displayName}
            initialData={editorState.data}
            onSave={handleSaveSkill}
            onCancel={handleCloseEditor}
          />
        )}
      </div>
    </SettingsTabLayout>
  )
}
