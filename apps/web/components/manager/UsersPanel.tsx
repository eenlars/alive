"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"

interface User {
  user_id: string
  email: string | null
  display_name: string | null
  created_at: string
  status: string
  site_count: number
  max_sites: number
}

interface UsersPanelProps {
  orgs: any[]
  onSuccess: () => void
  onLoading: (loading: boolean) => void
}

export function UsersPanel({ orgs, onSuccess, onLoading }: UsersPanelProps) {
  // User list state
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [editingQuota, setEditingQuota] = useState<string | null>(null)
  const [newQuotaValue, setNewQuotaValue] = useState("")
  const [savingQuota, setSavingQuota] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const quotaInputRef = useRef<HTMLInputElement>(null)

  // Create user form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [orgType, setOrgType] = useState<"new" | "existing">("new")
  const [orgId, setOrgId] = useState("")
  const [orgName, setOrgName] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const response = await fetch("/api/manager/users")
      const data = await response.json()
      if (data.ok) {
        setUsers(data.users)
      } else {
        toast.error("Failed to fetch users")
      }
    } catch (error) {
      console.error("Failed to fetch users:", error)
      toast.error("Failed to fetch users")
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Focus quota input when editing starts
  useEffect(() => {
    if (editingQuota && quotaInputRef.current) {
      quotaInputRef.current.focus()
    }
  }, [editingQuota])

  const handleUpdateQuota = async (userId: string) => {
    const maxSites = Number.parseInt(newQuotaValue, 10)
    if (Number.isNaN(maxSites) || maxSites < 0) {
      toast.error("Please enter a valid non-negative number")
      return
    }

    setSavingQuota(true)
    try {
      const response = await fetch("/api/manager/users/quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, maxSites }),
      })

      const data = await response.json()
      if (data.ok) {
        toast.success(`Quota updated to ${maxSites} sites`)
        setUsers(prev => prev.map(u => (u.user_id === userId ? { ...u, max_sites: maxSites } : u)))
        setEditingQuota(null)
        setNewQuotaValue("")
      } else {
        toast.error(data.message || "Failed to update quota")
      }
    } catch (error) {
      console.error("Failed to update quota:", error)
      toast.error("Failed to update quota")
    } finally {
      setSavingQuota(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsSubmitting(true)
    onLoading(true)

    try {
      const payload: any = {
        email,
        password,
        displayName: displayName || undefined,
        orgType,
      }

      if (orgType === "new") {
        if (!orgName) {
          setError("Organization name is required")
          setIsSubmitting(false)
          onLoading(false)
          return
        }
        payload.orgName = orgName
      } else {
        if (!orgId) {
          setError("Please select an organization")
          setIsSubmitting(false)
          onLoading(false)
          return
        }
        payload.orgId = orgId
      }

      const response = await fetch("/api/manager/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.message || "Failed to create user")
        return
      }

      setSuccess(`User ${email} created successfully`)
      setEmail("")
      setPassword("")
      setDisplayName("")
      setOrgType("new")
      setOrgId("")
      setOrgName("")
      setShowCreateForm(false)
      onSuccess()
      fetchUsers()

      setTimeout(() => setSuccess(""), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSubmitting(false)
      onLoading(false)
    }
  }

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  // Filter users by search query
  const filteredUsers = users.filter(
    user =>
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="bg-white dark:bg-[#1a1a1a]">
      <div className="px-4 sm:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Users</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Manage user accounts and site quotas</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={fetchUsers}
              disabled={usersLoading}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-[#333] border border-gray-300 dark:border-white/20 rounded-lg hover:bg-gray-50 dark:hover:bg-[#444] disabled:opacity-50 transition-colors"
            >
              {usersLoading ? "..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              {showCreateForm ? "Hide" : "Create"}
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-900 dark:text-red-300">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-sm text-emerald-900 dark:text-emerald-300">{success}</p>
          </div>
        )}

        {/* Create User Form (collapsible) */}
        {showCreateForm && (
          <div className="mb-6 sm:mb-8 p-4 sm:p-6 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg border border-gray-200 dark:border-white/10">
            <h3 className="text-sm sm:text-md font-semibold text-gray-900 dark:text-white mb-4">Create new user</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-[#333]"
                    placeholder="user@example.com"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-[#333]"
                    placeholder="John Doe"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-[#333]"
                    placeholder="••••••••"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label htmlFor="orgSelect" className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Organization
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={orgType}
                      onChange={e => {
                        setOrgType(e.target.value as "new" | "existing")
                        if (e.target.value === "new") setOrgId("")
                        else setOrgName("")
                      }}
                      className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-[#333]"
                      disabled={isSubmitting}
                    >
                      <option value="new">New org</option>
                      <option value="existing">Existing</option>
                    </select>
                    {orgType === "new" ? (
                      <input
                        type="text"
                        value={orgName}
                        onChange={e => setOrgName(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-[#333]"
                        placeholder="Organization name"
                        disabled={isSubmitting}
                      />
                    ) : (
                      <select
                        value={orgId}
                        onChange={e => setOrgId(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-[#333]"
                        disabled={isSubmitting}
                      >
                        <option value="">Select...</option>
                        {orgs.map(org => (
                          <option key={org.org_id} value={org.org_id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isSubmitting}
                  className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-[#333] border border-gray-300 dark:border-white/20 rounded-lg hover:bg-gray-50 dark:hover:bg-[#444] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search users by email or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-[#333]"
          />
        </div>

        {/* Users - Mobile Cards */}
        <div className="sm:hidden space-y-3">
          {usersLoading ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              {searchQuery ? "No users match your search" : "No users found"}
            </div>
          ) : (
            filteredUsers.map(user => (
              <div
                key={user.user_id}
                className="border border-gray-200 dark:border-white/10 rounded-lg p-3 bg-white dark:bg-[#2a2a2a]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {user.email || "No email"}
                    </div>
                    {user.display_name && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.display_name}</div>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                      user.status === "active"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {user.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                    <span>
                      Sites:{" "}
                      <span
                        className={
                          user.site_count >= user.max_sites
                            ? "text-red-600 dark:text-red-400 font-medium"
                            : "font-medium text-gray-900 dark:text-white"
                        }
                      >
                        {user.site_count}
                      </span>
                    </span>
                    <span>
                      Quota:{" "}
                      {editingQuota === user.user_id ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            ref={quotaInputRef}
                            type="number"
                            min="0"
                            value={newQuotaValue}
                            onChange={e => setNewQuotaValue(e.target.value)}
                            className="w-14 px-1 py-0.5 text-xs border border-gray-300 dark:border-white/20 rounded bg-white dark:bg-[#333] text-gray-900 dark:text-white"
                            onKeyDown={e => {
                              if (e.key === "Enter") handleUpdateQuota(user.user_id)
                              if (e.key === "Escape") {
                                setEditingQuota(null)
                                setNewQuotaValue("")
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuota(user.user_id)}
                            disabled={savingQuota}
                            className="text-green-600"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuota(null)
                              setNewQuotaValue("")
                            }}
                            className="text-gray-500"
                          >
                            ×
                          </button>
                        </span>
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-white">{user.max_sites}</span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQuota(user.user_id)
                      setNewQuotaValue(String(user.max_sites))
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Users Table - Desktop */}
        <div className="hidden sm:block border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sites
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Quota
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {usersLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {searchQuery ? "No users match your search" : "No users found"}
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a]">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {user.email || "No email"}
                        </div>
                        {user.display_name && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{user.display_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          user.status === "active"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-sm font-medium ${
                          user.site_count >= user.max_sites
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {user.site_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingQuota === user.user_id ? (
                        <div className="flex items-center gap-2">
                          <input
                            ref={quotaInputRef}
                            type="number"
                            min="0"
                            value={newQuotaValue}
                            onChange={e => setNewQuotaValue(e.target.value)}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-white/20 rounded bg-white dark:bg-[#333] text-gray-900 dark:text-white"
                            onKeyDown={e => {
                              if (e.key === "Enter") handleUpdateQuota(user.user_id)
                              if (e.key === "Escape") {
                                setEditingQuota(null)
                                setNewQuotaValue("")
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuota(user.user_id)}
                            disabled={savingQuota}
                            className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {savingQuota ? "..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuota(null)
                              setNewQuotaValue("")
                            }}
                            className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#444] rounded hover:bg-gray-200 dark:hover:bg-[#555]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{user.max_sites}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuota(user.user_id)
                          setNewQuotaValue(String(user.max_sites))
                        }}
                        className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                      >
                        Edit quota
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Stats */}
        {!usersLoading && users.length > 0 && (
          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        )}
      </div>
    </div>
  )
}
