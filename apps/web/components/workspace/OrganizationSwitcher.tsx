"use client"

import { ChevronDown } from "lucide-react"
import { useEffect, useState } from "react"
import { useFetch } from "@/lib/hooks/useFetch"
import { useAppHydrated } from "@/lib/stores/HydrationBoundary"
import { type Organization, useSelectedOrgId, useWorkspaceActions } from "@/lib/stores/workspaceStore"

interface OrganizationSwitcherProps {
  onOrgChange?: (orgId: string | null) => void
}

export function OrganizationSwitcher({ onOrgChange }: OrganizationSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOrgId = useSelectedOrgId()
  const hasHydrated = useAppHydrated()
  const { setSelectedOrg } = useWorkspaceActions()

  const { data, loading, error, retry } = useFetch<{ ok: boolean; organizations: Organization[] }>({
    url: "/api/auth/organizations",
    validator: (data): data is { ok: boolean; organizations: Organization[] } =>
      typeof data === "object" && data !== null && "ok" in data && data.ok === true,
  })

  const organizations = data?.organizations || []

  // Auto-select first org if none selected
  // IMPORTANT: Wait for Zustand hydration to complete before auto-selecting
  // Otherwise we might override the persisted org selection from localStorage
  useEffect(() => {
    if (!hasHydrated) return // Wait for localStorage to be loaded
    if (!loading && organizations.length > 0 && !selectedOrgId) {
      const firstOrg = organizations[0]
      setSelectedOrg(firstOrg.org_id)
      onOrgChange?.(firstOrg.org_id)
    }
  }, [hasHydrated, loading, organizations, selectedOrgId, setSelectedOrg, onOrgChange])

  function handleSelectOrg(orgId: string) {
    setSelectedOrg(orgId)
    setIsOpen(false)
    onOrgChange?.(orgId)
  }

  const selectedOrg = organizations.find(org => org.org_id === selectedOrgId)

  if (loading) {
    return (
      <span className="ml-3 text-xs text-black/50 dark:text-white/50 flex items-center gap-1">
        <div className="w-2 h-2 border border-black/20 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin" />
        loading orgs...
      </span>
    )
  }

  if (error) {
    return (
      <div className="ml-3 flex items-center gap-2">
        <span className="text-xs text-red-600 dark:text-red-400" title={error}>
          error loading orgs
        </span>
        <button
          type="button"
          onClick={retry}
          disabled={loading}
          className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "..." : "retry"}
        </button>
      </div>
    )
  }

  if (organizations.length === 0) {
    return (
      <span className="ml-3 text-xs text-orange-600 dark:text-orange-400" title="No organizations found">
        no orgs
      </span>
    )
  }

  if (organizations.length === 1) {
    return (
      <span className="ml-3 font-diatype-mono text-black/80 dark:text-white/80 font-medium">{selectedOrg?.name}</span>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="ml-3 font-diatype-mono text-black/80 dark:text-white/80 font-medium hover:text-black dark:hover:text-white transition-colors flex items-center gap-1"
      >
        <span>{selectedOrg?.name || "select"}</span>
        <ChevronDown size={10} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setIsOpen(false)}
            aria-label="Close dropdown"
            tabIndex={-1}
          />
          <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-[#1a1a1a] border border-black/10 dark:border-white/10 rounded-lg shadow-lg z-20 max-h-[300px] overflow-y-auto">
            {organizations.map(org => (
              <button
                type="button"
                key={org.org_id}
                onClick={() => handleSelectOrg(org.org_id)}
                className={`w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                  org.org_id === selectedOrgId ? "bg-black/5 dark:bg-white/5" : ""
                }`}
              >
                <div className="text-sm font-medium text-black dark:text-white">{org.name}</div>
                <div className="text-xs text-black/50 dark:text-white/50">
                  {org.workspace_count || 0} workspace{org.workspace_count !== 1 ? "s" : ""} · {org.credits} credits
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
