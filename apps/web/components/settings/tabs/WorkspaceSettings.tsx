"use client"

import { Building2, ChevronDown, UserMinus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { AddWebsiteModal } from "@/components/modals/AddWebsiteModal"
import { DeleteModal } from "@/components/modals/DeleteModal"
import type { Organization } from "@/lib/api/types"
import { useOrganizations } from "@/lib/hooks/useOrganizations"
import { canRemoveMember } from "@/lib/permissions/org-permissions"
import { useCurrentWorkspace, useSelectedOrgId, useWorkspaceActions } from "@/lib/stores/workspaceStore"
import { input, primaryButton, secondaryButton, smallButton, text } from "../styles"
import { SettingsTabLayout } from "./SettingsTabLayout"

interface OrgMember {
  user_id: string
  email: string
  display_name: string | null
  role: "owner" | "admin" | "member"
}

// Hook: Organization name editing
function useOrgEditor(refetch: () => Promise<void>) {
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null)
  const [editOrgName, setEditOrgName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = (org: Organization) => {
    setEditingOrgId(org.org_id)
    setEditOrgName(org.name)
  }

  const cancelEdit = () => {
    setEditingOrgId(null)
    setEditOrgName("")
    setError(null)
  }

  const saveEdit = async (orgId: string) => {
    if (!editOrgName.trim()) return

    try {
      setSaving(true)
      setError(null)

      const res = await fetch("/api/auth/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ org_id: orgId, name: editOrgName.trim() }),
      })

      const data = await res.json()

      if (data.ok) {
        await refetch()
        setEditingOrgId(null)
        setEditOrgName("")
      } else {
        setError(data.error || "Failed to update organization")
      }
    } catch (err) {
      console.error("Failed to update organization:", err)
      setError("Failed to update organization")
    } finally {
      setSaving(false)
    }
  }

  return { editingOrgId, editOrgName, setEditOrgName, saving, error, startEdit, cancelEdit, saveEdit }
}

// Hook: Organization members management
function useOrgMembers() {
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null)
  const [orgMembers, setOrgMembers] = useState<Record<string, OrgMember[]>>({})
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({})
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<{ orgId: string; userId: string; email: string } | null>(null)

  const toggleMembers = async (orgId: string) => {
    if (expandedOrgId === orgId) {
      setExpandedOrgId(null)
      return
    }

    setExpandedOrgId(orgId)

    if (!orgMembers[orgId]) {
      try {
        setLoadingMembers(prev => ({ ...prev, [orgId]: true }))
        const res = await fetch(`/api/auth/org-members?orgId=${orgId}`, { credentials: "include" })
        const data = await res.json()
        if (data.ok) {
          setOrgMembers(prev => ({ ...prev, [orgId]: data.members }))
        }
      } catch (err) {
        console.error("Failed to fetch members:", err)
      } finally {
        setLoadingMembers(prev => ({ ...prev, [orgId]: false }))
      }
    }
  }

  const requestRemoveMember = (orgId: string, userId: string, email: string) => {
    setMemberToRemove({ orgId, userId, email })
  }

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return

    const { orgId, userId, email } = memberToRemove

    try {
      setRemovingMember(userId)
      setMemberToRemove(null)

      const res = await fetch("/api/auth/org-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId, targetUserId: userId }),
      })

      const data = await res.json()

      if (data.ok) {
        setOrgMembers(prev => ({ ...prev, [orgId]: prev[orgId].filter(m => m.user_id !== userId) }))
        toast.success(`Removed ${email} from organization`)
      } else {
        toast.error(data.message || "Failed to remove member")
      }
    } catch (err) {
      console.error("Failed to remove member:", err)
      toast.error("Failed to remove member")
    } finally {
      setRemovingMember(null)
    }
  }

  const cancelRemoveMember = () => setMemberToRemove(null)

  return {
    expandedOrgId,
    orgMembers,
    loadingMembers,
    removingMember,
    memberToRemove,
    toggleMembers,
    requestRemoveMember,
    confirmRemoveMember,
    cancelRemoveMember,
  }
}

// Hook: Leave organization
function useOrgLeave() {
  const [leavingOrg, setLeavingOrg] = useState<string | null>(null)
  const [orgToLeave, setOrgToLeave] = useState<{ orgId: string; orgName: string } | null>(null)

  const requestLeave = (orgId: string, orgName: string) => {
    setOrgToLeave({ orgId, orgName })
  }

  const confirmLeave = async () => {
    if (!orgToLeave) return

    const { orgId, orgName } = orgToLeave

    try {
      setLeavingOrg(orgId)
      setOrgToLeave(null)

      const res = await fetch("/api/auth/org-members/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId }),
      })

      const data = await res.json()

      if (data.ok) {
        toast.success(`Left ${orgName}`)
        window.location.reload()
      } else {
        toast.error(data.message || "Failed to leave organization")
      }
    } catch (err) {
      console.error("Failed to leave org:", err)
      toast.error("Failed to leave organization")
    } finally {
      setLeavingOrg(null)
    }
  }

  const cancelLeave = () => setOrgToLeave(null)

  return { leavingOrg, orgToLeave, requestLeave, confirmLeave, cancelLeave }
}

// Cache for org sites (lives outside component for persistence)
const orgSitesCache = new Map<string, string[]>()
export { orgSitesCache }

// Custom hook for fetching workspaces with caching
function useOrgWorkspaces(orgId: string) {
  const [workspaces, setWorkspaces] = useState<string[]>(() => orgSitesCache.get(orgId) || [])
  const [loading, setLoading] = useState(!orgSitesCache.has(orgId))
  const [error, setError] = useState<string | null>(null)

  const fetchWorkspaces = useCallback(() => {
    if (!orgSitesCache.has(orgId)) setLoading(true)
    setError(null)

    fetch(`/api/auth/workspaces?org_id=${orgId}`, { credentials: "include" })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`Failed to load sites (${res.status})`))))
      .then(data => {
        if (data.ok && data.workspaces) {
          setWorkspaces(data.workspaces)
          orgSitesCache.set(orgId, data.workspaces)
          setError(null)
        } else {
          throw new Error(data.error || "Failed to load sites")
        }
      })
      .catch(err => {
        const errorMessage = err instanceof Error ? err.message : "Network error"
        setError(errorMessage)
        if (!orgSitesCache.has(orgId)) setWorkspaces([])
      })
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => {
    const cached = orgSitesCache.get(orgId)
    if (cached) {
      setWorkspaces(cached)
      setLoading(false)
    }
    fetchWorkspaces()
  }, [fetchWorkspaces, orgId])

  return { workspaces, loading, error, refetch: fetchWorkspaces }
}

// Custom hook for workspace switching
// Uses the store as the single source of truth
function useWorkspaceSwitch() {
  const currentWorkspace = useCurrentWorkspace()
  const { setCurrentWorkspace } = useWorkspaceActions()
  const [optimisticWorkspace, setOptimisticWorkspace] = useState<string | null>(null)

  const switchWorkspace = useCallback(
    (workspace: string, orgId: string) => {
      // Optimistic update for immediate feedback
      setOptimisticWorkspace(workspace)
      // Update the store (single source of truth)
      setCurrentWorkspace(workspace, orgId)
      // Navigate to chat
      setTimeout(() => {
        window.location.href = "/chat"
      }, 100)
    },
    [setCurrentWorkspace],
  )

  return {
    currentWorkspace: optimisticWorkspace || currentWorkspace,
    switchWorkspace,
  }
}

export { useOrgWorkspaces, useWorkspaceSwitch }

// Reusable workspaces grid component
export function WorkspacesGrid({
  workspaces,
  currentWorkspace,
  loading,
  error,
  onSwitch,
  onRetry,
}: {
  workspaces: string[]
  currentWorkspace: string | null
  loading: boolean
  error: string | null
  onSwitch: (workspace: string) => void
  onRetry?: () => void
}) {
  if (loading) {
    return (
      <div className="px-3 py-4 text-xs text-black/40 dark:text-white/40 text-center rounded-xl bg-black/[0.03] dark:bg-white/[0.03]">
        Loading websites...
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-3 py-3 text-xs text-center rounded-xl bg-red-500/5 dark:bg-red-500/5 space-y-2">
        <p className={text.error}>{error}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className={smallButton}>
            Retry
          </button>
        )}
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-black/40 dark:text-white/40 text-center rounded-xl bg-black/[0.03] dark:bg-white/[0.03]">
        No websites yet
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {workspaces.map(workspace => {
        const isCurrent = workspace === currentWorkspace
        return (
          <button
            key={workspace}
            type="button"
            disabled={isCurrent}
            className={`text-left px-3 py-3 sm:py-2.5 rounded-xl border transition-all duration-150 active:scale-[0.98] ${
              isCurrent
                ? "border-black/20 dark:border-white/20 bg-black/[0.04] dark:bg-white/[0.04]"
                : "border-black/[0.08] dark:border-white/[0.08] hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer"
            }`}
            onClick={() => onSwitch(workspace)}
          >
            <div className="flex items-center sm:flex-col sm:items-start justify-between sm:justify-start gap-2 sm:gap-1.5">
              <span className="text-sm font-medium text-black/90 dark:text-white/90 truncate flex-1" title={workspace}>
                {workspace}
              </span>
              {isCurrent ? (
                <span className="text-xs px-2 py-0.5 bg-black dark:bg-white text-white dark:text-black rounded-lg flex-shrink-0">
                  Current
                </span>
              ) : (
                <span className={`${text.muted} flex-shrink-0`}>Tap to switch</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function _OrgSitesSection({ orgId }: { orgId: string }) {
  const { workspaces, loading, error, refetch } = useOrgWorkspaces(orgId)
  const { currentWorkspace, switchWorkspace } = useWorkspaceSwitch()
  const [showAddModal, setShowAddModal] = useState(false)

  // Wrap switchWorkspace to include orgId
  const handleSwitch = useCallback(
    (workspace: string) => {
      switchWorkspace(workspace, orgId)
    },
    [switchWorkspace, orgId],
  )

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-sm font-medium text-black dark:text-white">Spaces</h5>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="text-xs text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
        >
          + Add Space
        </button>
      </div>

      <WorkspacesGrid
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        loading={loading}
        error={error}
        onSwitch={handleSwitch}
        onRetry={refetch}
      />

      {showAddModal && <AddWebsiteModal onClose={() => setShowAddModal(false)} onSuccess={refetch} />}
    </div>
  )
}

export function WorkspaceSettings() {
  const { organizations, currentUserId, loading, error, refetch } = useOrganizations()
  const selectedOrgId = useSelectedOrgId()
  const { setSelectedOrg } = useWorkspaceActions()

  // Use extracted hooks for clean state management
  const editor = useOrgEditor(refetch)
  const members = useOrgMembers()
  const leave = useOrgLeave()

  // Invite state (TODO: Wire up invite UI)
  const [inviteEmail, setInviteEmail] = useState("")
  const [_inviting, setInviting] = useState(false)

  const handleSelectOrg = (orgId: string) => {
    setSelectedOrg(orgId)
    editor.cancelEdit()
  }

  // Auto-fetch members when org is selected (moved from render to useEffect)
  useEffect(() => {
    if (selectedOrgId && !members.orgMembers[selectedOrgId] && members.expandedOrgId !== selectedOrgId) {
      members.toggleMembers(selectedOrgId)
    }
  }, [selectedOrgId, members])

  const getCurrentUserRole = (orgId: string): "owner" | "admin" | "member" | null => {
    const org = organizations.find(o => o.org_id === orgId)
    return org?.role || null
  }

  const _handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedOrgId) return

    setInviting(true)
    try {
      // TODO: Implement actual invite API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail("")
    } catch (_err) {
      toast.error("Failed to send invitation")
    } finally {
      setInviting(false)
    }
  }

  return (
    <SettingsTabLayout title="Workspace" description="Invite teammates and manage your organization">
      {/* Errors */}
      {error && (
        <div className="px-4 py-3 bg-red-500/5 dark:bg-red-500/5 border border-red-500/10 dark:border-red-500/10 rounded-xl space-y-2">
          <p className={text.error} data-testid="org-error-message">
            {error}
          </p>
          <button type="button" onClick={refetch} className={smallButton} data-testid="org-error-retry">
            Retry
          </button>
        </div>
      )}
      {editor.error && (
        <div
          className={`px-4 py-3 bg-red-500/5 dark:bg-red-500/5 border border-red-500/10 dark:border-red-500/10 rounded-xl ${text.error}`}
        >
          {editor.error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-8 h-8 border-2 border-black/[0.08] dark:border-white/[0.08] border-t-black/60 dark:border-t-white/60 rounded-full animate-spin" />
          <p className={text.muted}>Loading organizations...</p>
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-center py-12">
          <Building2 size={48} strokeWidth={1} className="mx-auto mb-4 text-black/20 dark:text-white/20" />
          <p className={`${text.description} mb-4`}>No organizations found</p>
          <button type="button" className={primaryButton}>
            Create Organization
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Organization Selector */}
          <div className="flex flex-wrap gap-2">
            {organizations.map(org => (
              <button
                key={org.org_id}
                type="button"
                onClick={() => handleSelectOrg(org.org_id)}
                className={`px-3 py-1.5 rounded-xl text-sm transition-all duration-150 active:scale-95 ${
                  org.org_id === selectedOrgId
                    ? "bg-black dark:bg-white text-white dark:text-black font-medium"
                    : "bg-black/[0.04] dark:bg-white/[0.04] text-black/60 dark:text-white/60 hover:bg-black/[0.08] dark:hover:bg-white/[0.08] hover:text-black/80 dark:hover:text-white/80"
                }`}
              >
                {org.name}
              </button>
            ))}
          </div>

          {/* Selected Organization Content */}
          {selectedOrgId &&
            (() => {
              const selectedOrg = organizations.find(org => org.org_id === selectedOrgId)
              if (!selectedOrg) return null

              return (
                <div className="space-y-5">
                  {/* Quick Summary Bar */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-black/50 dark:text-white/50">
                    <span>
                      <strong className="text-black/90 dark:text-white/90">{selectedOrg.credits.toFixed(2)}</strong>{" "}
                      credits
                    </span>
                    <span className="hidden sm:inline text-black/20 dark:text-white/20">•</span>
                    <span>
                      <strong className="text-black/90 dark:text-white/90">{selectedOrg.workspace_count || 0}</strong>{" "}
                      websites
                    </span>
                    <span className="hidden sm:inline text-black/20 dark:text-white/20">•</span>
                    <span>
                      <strong className="text-black/90 dark:text-white/90">
                        {members.orgMembers[selectedOrg.org_id]?.length || 0}
                      </strong>{" "}
                      members
                    </span>
                  </div>

                  {/* PRIMARY: Invite Section */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={text.label}>Invite teammates</h4>
                        <span className="px-2 py-0.5 bg-amber-500/10 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium rounded-lg">
                          Coming soon
                        </span>
                      </div>
                      <p className={text.description}>
                        Give access to <strong>{selectedOrg.name}</strong> workspace and shared credits
                      </p>
                      <p className={`${text.muted} mt-1`}>
                        Contact us to enable team invitations for your organization
                      </p>
                    </div>
                    <div className="flex gap-2 opacity-40">
                      <input type="email" placeholder="email@example.com" disabled className={`flex-1 ${input}`} />
                      <button type="button" disabled className={primaryButton}>
                        Invite
                      </button>
                    </div>
                  </div>

                  {/* Members List - Always Visible */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className={text.label}>Members</h4>
                    </div>

                    {members.loadingMembers[selectedOrg.org_id] ? (
                      <div className="py-8 text-center">
                        <div className="inline-block w-5 h-5 border-2 border-black/[0.08] dark:border-white/[0.08] border-t-black/60 dark:border-t-white/60 rounded-full animate-spin" />
                      </div>
                    ) : members.orgMembers[selectedOrg.org_id] && members.orgMembers[selectedOrg.org_id].length > 0 ? (
                      <div className="space-y-2">
                        {members.orgMembers[selectedOrg.org_id].map(member => {
                          const currentUserRole = getCurrentUserRole(selectedOrg.org_id)
                          const isCurrentUser = member.user_id === currentUserId
                          const canRemove = canRemoveMember(currentUserRole, member.role, isCurrentUser)

                          return (
                            <div
                              key={member.user_id}
                              className="flex items-start sm:items-center justify-between px-3 py-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.12] dark:hover:border-white/[0.12] transition-colors duration-150 gap-2"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-0.5">
                                  <span className="text-sm font-medium text-black/90 dark:text-white/90 truncate max-w-[180px] sm:max-w-none">
                                    {member.display_name || member.email}
                                    {isCurrentUser && <span className={`ml-1 ${text.muted} font-normal`}>(you)</span>}
                                  </span>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-lg font-medium flex-shrink-0 ${
                                      member.role === "owner"
                                        ? "bg-violet-500/10 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
                                        : member.role === "admin"
                                          ? "bg-blue-500/10 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                          : "bg-black/[0.04] dark:bg-white/[0.06] text-black/60 dark:text-white/60"
                                    }`}
                                  >
                                    {member.role}
                                  </span>
                                </div>
                                <div className={`${text.muted} truncate`}>{member.email}</div>
                              </div>

                              {canRemove && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    members.requestRemoveMember(selectedOrg.org_id, member.user_id, member.email)
                                  }
                                  disabled={members.removingMember === member.user_id}
                                  className="flex-shrink-0 p-2 sm:p-1.5 text-red-500/70 dark:text-red-400/70 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/10 rounded-xl transition-colors duration-150 disabled:opacity-40"
                                  title="Remove member"
                                >
                                  <UserMinus size={18} strokeWidth={1.75} className="sm:w-4 sm:h-4" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className={`py-8 text-center ${text.muted}`}>No members yet. Invite someone above!</div>
                    )}
                  </div>

                  {/* Advanced Actions */}
                  <details className="group">
                    <summary className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-pointer transition-colors duration-150">
                      <span className={text.label}>Advanced</span>
                      <ChevronDown
                        size={16}
                        strokeWidth={1.75}
                        className="text-black/40 dark:text-white/40 group-open:rotate-180 transition-transform duration-150"
                      />
                    </summary>
                    <div className="mt-3 space-y-3 px-1">
                      {/* Rename Organization */}
                      <div>
                        <label htmlFor="org-name-input" className={`block ${text.label} mb-2`}>
                          Organization name
                        </label>
                        {editor.editingOrgId === selectedOrg.org_id ? (
                          <div className="flex gap-2">
                            <input
                              id="org-name-input"
                              type="text"
                              value={editor.editOrgName}
                              onChange={e => editor.setEditOrgName(e.target.value)}
                              className={`flex-1 ${input}`}
                            />
                            <button
                              type="button"
                              onClick={() => editor.saveEdit(selectedOrg.org_id)}
                              disabled={!editor.editOrgName.trim() || editor.saving}
                              className={primaryButton}
                            >
                              {editor.saving ? "..." : "Save"}
                            </button>
                            <button type="button" onClick={editor.cancelEdit} className={secondaryButton}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between px-3 py-2.5 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl">
                            <span className="text-sm text-black/80 dark:text-white/80">{selectedOrg.name}</span>
                            <button
                              type="button"
                              onClick={() => editor.startEdit(selectedOrg)}
                              className={`${text.description} hover:text-black/80 dark:hover:text-white/80 transition-colors`}
                            >
                              Rename
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Leave Organization */}
                      <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
                        <button
                          type="button"
                          onClick={() => leave.requestLeave(selectedOrg.org_id, selectedOrg.name)}
                          disabled={leave.leavingOrg === selectedOrg.org_id}
                          className="text-xs text-red-500/60 dark:text-red-400/60 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150 disabled:opacity-40"
                        >
                          {leave.leavingOrg === selectedOrg.org_id ? "Leaving..." : "Leave organization"}
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              )
            })()}
        </div>
      )}

      {/* Delete Member Confirmation Modal */}
      {members.memberToRemove && (
        <DeleteModal
          title="Remove Member"
          message={
            <>
              Are you sure you want to remove <strong>{members.memberToRemove.email}</strong> from this organization?
              <br />
              <br />
              This action cannot be undone.
            </>
          }
          confirmText="Remove"
          onConfirm={members.confirmRemoveMember}
          onCancel={members.cancelRemoveMember}
        />
      )}

      {/* Leave Organization Confirmation Modal */}
      {leave.orgToLeave && (
        <DeleteModal
          title="Leave Organization"
          message={
            <>
              Are you sure you want to leave <strong>{leave.orgToLeave.orgName}</strong>?
              <br />
              <br />
              This action cannot be undone.
            </>
          }
          confirmText="Leave"
          onConfirm={leave.confirmLeave}
          onCancel={leave.cancelLeave}
        />
      )}
    </SettingsTabLayout>
  )
}
