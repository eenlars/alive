"use client"

import { useState } from "react"
import type { ManagerOrganization } from "@/features/manager/lib/services/orgService"

interface OrganizationsListProps {
  orgs: ManagerOrganization[]
  loading: boolean
  deleting: string | null
  transferring: string | null
  removing: string | null
  creating: boolean
  onRefresh: () => void
  onEditCredits: (orgId: string, credits: number) => void
  onDelete: (orgId: string) => void
  onAddMember: (orgId: string) => void
  onTransferOwnership: (orgId: string, userId: string, userName: string) => void
  onRemoveMember: (orgId: string, userId: string) => void
  onTransferDomain: (domain: string, currentOrgId: string, targetOrgId: string) => void
  transferringDomain: string | null
  onCreateOrg: (name: string, credits: number, ownerUserId?: string) => void
  availableUsers: Array<{ user_id: string; email: string; display_name: string | null }>
}

export function OrganizationsList({
  orgs,
  loading,
  deleting,
  transferring,
  removing,
  creating,
  onRefresh,
  onEditCredits,
  onDelete,
  onAddMember,
  onTransferOwnership,
  onRemoveMember,
  onTransferDomain,
  transferringDomain,
  onCreateOrg,
  availableUsers,
}: OrganizationsListProps) {
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<{ hostname: string; orgId: string } | null>(null)
  const [targetOrgId, setTargetOrgId] = useState("")

  // Create org modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [newOrgCredits, setNewOrgCredits] = useState("0")
  const [newOrgOwner, setNewOrgOwner] = useState("")

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) return
    onCreateOrg(newOrgName.trim(), parseFloat(newOrgCredits) || 0, newOrgOwner || undefined)
    setCreateModalOpen(false)
    setNewOrgName("")
    setNewOrgCredits("0")
    setNewOrgOwner("")
  }

  return (
    <>
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {orgs.length} organization{orgs.length !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="text-xs px-2.5 py-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900/40 transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-[#333] dark:text-slate-300 dark:border-white/20 dark:hover:bg-[#444] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div>
        {loading ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading organizations...</p>
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">No organizations found</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              Organizations will appear here when created
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {orgs.map(org => (
              <div key={org.org_id} className="hover:bg-slate-50 dark:hover:bg-[#333]">
                {/* Organization Header */}
                <div className="px-4 sm:px-6 py-4 sm:py-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setExpandedOrg(expandedOrg === org.org_id ? null : org.org_id)}
                        className="text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                          {org.name}
                        </h3>
                      </button>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                        <span>
                          Credits:{" "}
                          <span className="font-medium text-slate-900 dark:text-white">{org.credits.toFixed(2)}</span>
                        </span>
                        <span>Members: {org.member_count}</span>
                        <span>Projects: {org.domain_count}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>Created {new Date(org.created_at).toLocaleDateString()}</span>
                        <span className="hidden sm:inline text-slate-400 dark:text-slate-500">•</span>
                        <span className="font-mono text-xs truncate max-w-[120px] sm:max-w-none">{org.org_id}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEditCredits(org.org_id, org.credits)}
                        className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/40 transition-colors"
                      >
                        Credits
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(org.org_id)}
                        disabled={deleting === org.org_id}
                        className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {deleting === org.org_id ? "..." : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedOrg(expandedOrg === org.org_id ? null : org.org_id)}
                        className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-[#333] dark:text-slate-300 dark:border-white/20 dark:hover:bg-[#444] transition-colors"
                      >
                        {expandedOrg === org.org_id ? "−" : "+"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedOrg === org.org_id && (
                  <div className="px-4 sm:px-6 py-4 sm:py-5 bg-white dark:bg-[#2a2a2a] border-t border-slate-200 dark:border-white/10 space-y-5 sm:space-y-6">
                    {/* Projects */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Projects</h4>
                      {org.domains.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No projects</p>
                      ) : (
                        <div className="space-y-2">
                          {org.domains.map(domain => (
                            <div
                              key={domain.domain_id}
                              className="px-3 py-2 bg-slate-50 dark:bg-[#333] rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3"
                            >
                              <button
                                type="button"
                                className="flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity min-w-0"
                                onClick={() => window.open(`https://${domain.hostname}`, "_blank")}
                              >
                                <div className="font-medium text-blue-600 dark:text-blue-400 text-sm truncate">
                                  {domain.hostname}
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                                  Port {domain.port}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDomain({ hostname: domain.hostname, orgId: org.org_id })
                                  setTargetOrgId("")
                                  setTransferModalOpen(true)
                                }}
                                disabled={transferringDomain === domain.hostname}
                                className="text-xs px-2 py-1 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 self-start sm:self-center"
                              >
                                {transferringDomain === domain.hostname ? "..." : "Transfer"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Members */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Members</h4>
                        <button
                          type="button"
                          onClick={() => onAddMember(org.org_id)}
                          className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900/40 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                      {org.members.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No members</p>
                      ) : (
                        <div className="space-y-2">
                          {org.members.map(member => (
                            <div key={member.user_id} className="px-3 py-2 bg-slate-50 dark:bg-[#333] rounded">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                    {member.display_name || member.email}
                                  </div>
                                  {member.display_name && (
                                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                                      {member.email}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                  <span className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-white dark:bg-[#444] border border-slate-200 dark:border-white/20 rounded text-slate-700 dark:text-slate-300 font-medium">
                                    {member.role}
                                  </span>
                                  {member.role !== "owner" && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onTransferOwnership(
                                            org.org_id,
                                            member.user_id,
                                            member.display_name || member.email,
                                          )
                                        }
                                        disabled={transferring === member.user_id}
                                        className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        {transferring === member.user_id ? "..." : "Owner"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onRemoveMember(org.org_id, member.user_id)}
                                        disabled={removing === member.user_id}
                                        className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        {removing === member.user_id ? "..." : "×"}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transfer Domain Modal */}
      {transferModalOpen && selectedDomain && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Transfer Domain</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Transfer <span className="font-medium text-slate-900 dark:text-white">{selectedDomain.hostname}</span>{" "}
                to another organization
              </p>
              <div>
                <label
                  htmlFor="target-org"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Target Organization
                </label>
                <select
                  id="target-org"
                  value={targetOrgId}
                  onChange={e => setTargetOrgId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-white/20 rounded-lg bg-white dark:bg-[#2a2a2a] text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent"
                >
                  <option value="">Select organization...</option>
                  {orgs
                    .filter(org => org.org_id !== selectedDomain.orgId)
                    .map(org => (
                      <option key={org.org_id} value={org.org_id}>
                        {org.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setTransferModalOpen(false)
                  setSelectedDomain(null)
                  setTargetOrgId("")
                }}
                className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-[#2a2a2a] border border-slate-300 dark:border-white/20 rounded-lg hover:bg-slate-50 dark:hover:bg-[#333] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (targetOrgId && selectedDomain) {
                    onTransferDomain(selectedDomain.hostname, selectedDomain.orgId, targetOrgId)
                    setTransferModalOpen(false)
                    setSelectedDomain(null)
                    setTargetOrgId("")
                  }
                }}
                disabled={!targetOrgId || transferringDomain === selectedDomain.hostname}
                className="px-4 py-2 text-sm text-white bg-indigo-600 dark:bg-indigo-500 rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {transferringDomain === selectedDomain.hostname ? "Transferring..." : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Organization</h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label htmlFor="org-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Organization Name
                </label>
                <input
                  id="org-name"
                  type="text"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="My Organization"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-white/20 rounded-lg bg-white dark:bg-[#2a2a2a] text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent"
                  onKeyDown={e => {
                    if (e.key === "Enter") handleCreateOrg()
                    if (e.key === "Escape") setCreateModalOpen(false)
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="org-credits"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Starting Credits
                </label>
                <input
                  id="org-credits"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newOrgCredits}
                  onChange={e => setNewOrgCredits(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-white/20 rounded-lg bg-white dark:bg-[#2a2a2a] text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent"
                />
              </div>
              <div>
                <label
                  htmlFor="org-owner"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Owner (optional)
                </label>
                <select
                  id="org-owner"
                  value={newOrgOwner}
                  onChange={e => setNewOrgOwner(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-white/20 rounded-lg bg-white dark:bg-[#2a2a2a] text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent"
                >
                  <option value="">No owner (add later)</option>
                  {availableUsers.map(user => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name || user.email} ({user.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Assign an existing user as the organization owner
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateModalOpen(false)
                  setNewOrgName("")
                  setNewOrgCredits("0")
                  setNewOrgOwner("")
                }}
                className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-[#2a2a2a] border border-slate-300 dark:border-white/20 rounded-lg hover:bg-slate-50 dark:hover:bg-[#333] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateOrg}
                disabled={!newOrgName.trim() || creating}
                className="px-4 py-2 text-sm text-white bg-emerald-600 dark:bg-emerald-500 rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
