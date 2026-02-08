"use client"

import { AlertTriangle, Building2, Globe, Search, Shield, User } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { AddWebsiteModal } from "@/components/modals/AddWebsiteModal"
import { EmptyState } from "@/components/ui/EmptyState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { SearchInput } from "@/components/ui/SearchInput"
import { useSuperadmin } from "@/hooks/use-superadmin"
import type { Organization } from "@/lib/api/types"
import { useOrganizations } from "@/lib/hooks/useOrganizations"
import { useAllWorkspacesQuery } from "@/lib/hooks/useSettingsQueries"
import { SettingsTabLayout } from "./SettingsTabLayout"
import { useWorkspaceSwitch, WorkspacesGrid } from "./WorkspaceSettings"

/** All websites data from superadmin endpoint */
interface AllWebsitesData {
  total: number
  websitesByOrg: Record<
    string,
    {
      orgName: string
      websites: Array<{
        hostname: string
        port: number
        credits: number
        orgId: string
        orgName: string
        ownerEmail: string
        createdAt: string
      }>
    }
  >
}

// Organization group header with workspace grid
function OrgWebsitesGroup({
  org,
  workspaces,
  currentWorkspace,
  onSwitch,
}: {
  org: Organization
  workspaces: string[]
  currentWorkspace: string | null
  onSwitch: (workspace: string, orgId: string) => void
}) {
  // Wrap onSwitch to include orgId
  const handleSwitch = useCallback(
    (workspace: string) => {
      onSwitch(workspace, org.org_id)
    },
    [onSwitch, org.org_id],
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={14} className="text-black/40 dark:text-white/40" />
        <h4 className="text-sm font-medium text-black dark:text-white">{org.name}</h4>
        <span className="text-xs text-black/40 dark:text-white/40">
          ({workspaces.length} website{workspaces.length !== 1 ? "s" : ""})
        </span>
      </div>
      <WorkspacesGrid
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        loading={false}
        error={null}
        onSwitch={handleSwitch}
      />
    </div>
  )
}

/** Superadmin view: All websites grouped by organization with owner info */
function AllWebsitesView({
  data,
  searchQuery,
  currentWorkspace,
  onSwitch,
}: {
  data: AllWebsitesData
  searchQuery: string
  currentWorkspace: string | null
  onSwitch: (workspace: string, orgId: string) => void
}) {
  const query = searchQuery.toLowerCase()

  // Filter and flatten for display
  const filteredOrgs = Object.entries(data.websitesByOrg)
    .map(([orgId, { orgName, websites }]) => ({
      orgId,
      orgName,
      websites: websites.filter(
        w => !query || w.hostname.toLowerCase().includes(query) || w.ownerEmail.toLowerCase().includes(query),
      ),
    }))
    .filter(g => g.websites.length > 0)

  if (filteredOrgs.length === 0) {
    return <EmptyState icon={Search} message={`No websites match "${searchQuery}"`} />
  }

  return (
    <div className="space-y-6">
      {filteredOrgs.map(({ orgId, orgName, websites }) => (
        <div key={orgId}>
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={14} className="text-black/40 dark:text-white/40" />
            <h4 className="text-sm font-medium text-black dark:text-white">{orgName}</h4>
            <span className="text-xs text-black/40 dark:text-white/40">
              ({websites.length} website{websites.length !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {websites.map(site => (
              <button
                type="button"
                key={site.hostname}
                onClick={() => onSwitch(site.hostname, orgId)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  currentWorkspace === site.hostname
                    ? "border-black dark:border-white bg-black/5 dark:bg-white/5"
                    : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
                }`}
              >
                <div className="font-medium text-sm text-black dark:text-white truncate">{site.hostname}</div>
                <div className="flex items-center gap-1 mt-1">
                  <User size={10} className="text-black/40 dark:text-white/40" />
                  <span className="text-xs text-black/50 dark:text-white/50 truncate">{site.ownerEmail}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function WebsitesSettings() {
  const { organizations, loading: orgsLoading } = useOrganizations()
  const { data: allWorkspaces = {}, isLoading: websitesLoading, refetch } = useAllWorkspacesQuery(organizations)
  const { currentWorkspace, switchWorkspace } = useWorkspaceSwitch()
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Superadmin: show all websites toggle
  const isSuperadmin = useSuperadmin()
  const [showAllWebsites, setShowAllWebsites] = useState(false)
  const [allWebsitesData, setAllWebsitesData] = useState<AllWebsitesData | null>(null)
  const [allWebsitesLoading, setAllWebsitesLoading] = useState(false)

  // Fetch all websites when superadmin toggles the view
  useEffect(() => {
    if (!showAllWebsites || !isSuperadmin) return

    setAllWebsitesLoading(true)
    fetch("/api/admin/all-websites", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.ok !== false) {
          setAllWebsitesData(data)
        }
      })
      .catch(err => {
        console.error("Failed to fetch all websites:", err)
      })
      .finally(() => {
        setAllWebsitesLoading(false)
      })
  }, [showAllWebsites, isSuperadmin])

  const loading = orgsLoading || websitesLoading
  const query = searchQuery.toLowerCase()

  // Filter workspaces by search
  const filteredGroups = organizations
    .map(org => ({
      org,
      workspaces: (allWorkspaces[org.org_id] || []).filter(w => !query || w.toLowerCase().includes(query)),
    }))
    .filter(g => g.workspaces.length > 0 || !query)

  const totalWebsites = Object.values(allWorkspaces).reduce((sum, ws) => sum + ws.length, 0)
  const filteredCount = filteredGroups.reduce((sum, g) => sum + g.workspaces.length, 0)

  const renderContent = () => {
    // Superadmin: show all websites view
    if (showAllWebsites && isSuperadmin) {
      if (allWebsitesLoading) return <LoadingSpinner message="Loading all websites..." />
      if (!allWebsitesData) return <EmptyState icon={Globe} message="No websites found" />
      return (
        <AllWebsitesView
          data={allWebsitesData}
          searchQuery={searchQuery}
          currentWorkspace={currentWorkspace}
          onSwitch={switchWorkspace}
        />
      )
    }

    // Normal user view
    if (loading) return <LoadingSpinner message="Loading websites..." />
    if (organizations.length === 0) return <EmptyState icon={Globe} message="No organizations found" />
    if (filteredCount === 0 && query) return <EmptyState icon={Search} message={`No websites match "${searchQuery}"`} />

    return (
      <div className="space-y-6">
        {filteredGroups.map(({ org, workspaces }) => (
          <OrgWebsitesGroup
            key={org.org_id}
            org={org}
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            onSwitch={switchWorkspace}
          />
        ))}
      </div>
    )
  }

  const description =
    showAllWebsites && allWebsitesData
      ? `All ${allWebsitesData.total} websites across all users`
      : `All your websites across ${organizations.length} organization${organizations.length !== 1 ? "s" : ""}`

  return (
    <SettingsTabLayout title="Websites" description={description}>
      <div className="space-y-5">
        {/* Superadmin: Show all websites toggle */}
        {isSuperadmin && (
          <button
            type="button"
            onClick={() => setShowAllWebsites(!showAllWebsites)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showAllWebsites
                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700"
                : "bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
            }`}
          >
            <Shield size={14} />
            {showAllWebsites ? "Showing All Websites" : "Show All Websites"}
          </button>
        )}

        {/* Warning when no workspace selected */}
        {!loading && !currentWorkspace && totalWebsites > 0 && !showAllWebsites && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg">
            <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700 dark:text-amber-300">
              <span className="font-medium">No site selected.</span>{" "}
              <span className="text-amber-600 dark:text-amber-400">Click on a website below to start chatting.</span>
            </div>
          </div>
        )}

        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={showAllWebsites ? "Search all websites or owners..." : "Search websites..."}
        />

        {query && !showAllWebsites && (
          <p className="text-xs text-black/50 dark:text-white/50">
            {filteredCount} of {totalWebsites} websites match &quot;{searchQuery}&quot;
          </p>
        )}

        {renderContent()}

        {!loading && !showAllWebsites && (
          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-80 active:scale-[0.98] transition-all"
            >
              + Add Website
            </button>
          </div>
        )}

        {showAddModal && <AddWebsiteModal onClose={() => setShowAddModal(false)} onSuccess={refetch} />}
      </div>
    </SettingsTabLayout>
  )
}
