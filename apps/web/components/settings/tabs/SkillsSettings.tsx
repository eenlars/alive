"use client"

import { useState } from "react"
import { PromptEditorModal } from "@/components/modals/PromptEditorModal"
import {
  useSkillsActions,
  useSkillsLoading,
  useSuperadminSkills,
  useUserSkills,
} from "@/lib/providers/SkillsStoreProvider"
import { sectionDivider, smallButton, text } from "../styles"
import { SettingsTabLayout } from "./SettingsTabLayout"

export function SkillsSettings() {
  const superadminSkills = useSuperadminSkills()
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
      <div className="space-y-2">
        {/* User Skills Section */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={text.label}>Custom Skills</span>
            <button type="button" onClick={() => handleOpenEditor("add")} className={smallButton}>
              + Add Skill
            </button>
          </div>
          <p className={`${text.description} mb-3`}>Your personal skills</p>

          {userSkills.length > 0 ? (
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              {userSkills.map(skill => (
                <div key={skill.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-sm font-medium text-black/80 dark:text-white/80 min-w-0 truncate">
                    {skill.displayName}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditor("edit", skill.id, skill.displayName, skill.prompt)}
                      className="px-2.5 py-1 text-xs text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] rounded-lg transition-all"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUserSkill(skill.id)}
                      className="px-2.5 py-1 text-xs text-red-500/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/[0.06] dark:hover:bg-red-500/[0.06] rounded-lg transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={`${text.muted} py-3`}>No custom skills yet. Click &quot;+ Add Skill&quot; to create one.</p>
          )}
        </div>

        {/* Global Skills Section */}
        <div className={sectionDivider}>
          <div className="flex items-center gap-2 mb-1">
            <span className={text.label}>Superadmin Skills</span>
            {isLoading && <span className={text.muted}>Loading...</span>}
          </div>
          <p className={`${text.description} mb-3`}>Skills from the repo, only visible to superadmins</p>

          {superadminSkills.length > 0 ? (
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              {superadminSkills.map(skill => (
                <div key={skill.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-black/80 dark:text-white/80">{skill.displayName}</span>
                    {skill.description && skill.description !== skill.displayName && (
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">{skill.description}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !isLoading && <p className={`${text.muted} py-3`}>No superadmin skills found.</p>
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
