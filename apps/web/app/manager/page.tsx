"use client"

import type { AppDatabase } from "@webalive/database"
import { isOrgRole, type OrgRole } from "@webalive/shared"
import { useCallback, useEffect, useState } from "react"
import toast, { Toaster } from "react-hot-toast"
import { FeedbackList } from "@/components/manager/FeedbackList"
import { OrganizationsList } from "@/components/manager/OrganizationsList"
import { SettingsPanel } from "@/components/manager/SettingsPanel"
import { SourcesTable } from "@/components/manager/SourcesTable"
import { TemplatesList } from "@/components/manager/TemplatesList"
import { UsersPanel } from "@/components/manager/UsersPanel"
import { ConfirmModal } from "@/components/modals/ConfirmModal"
import { DeleteModal } from "@/components/modals/DeleteModal"
import { Button } from "@/components/ui/primitives/Button"
import type { PermissionCheckResult } from "@/features/manager/lib/services/domainService"
import * as domainService from "@/features/manager/lib/services/domainService"
import * as domainTransferService from "@/features/manager/lib/services/domainTransferService"
import type { ManagerOrganization } from "@/features/manager/lib/services/orgService"
import * as orgService from "@/features/manager/lib/services/orgService"
import type { CleanupStats, ServiceStatus } from "@/features/manager/lib/services/settingsService"
import * as settingsService from "@/features/manager/lib/services/settingsService"
import { executeHandler } from "@/features/manager/lib/utils/executeHandler"
import { ApiError, delly, getty, postty, putty } from "@/lib/api/api-client"
import { validateRequest } from "@/lib/api/schemas"
import { resetPostHogIdentity } from "@/lib/posthog"
import type { DomainConfigClient, DomainStatus } from "@/types/domain"
import type { FeedbackEntry } from "@/types/feedback"
import type { SourceData } from "@/types/sources"

type DomainPasswords = Record<string, DomainConfigClient>
type Template = AppDatabase["app"]["Tables"]["templates"]["Row"]

export default function ManagerPage() {
  const [domains, setDomains] = useState<DomainPasswords>({})
  const [statuses, setStatuses] = useState<Record<string, DomainStatus>>({})
  const [loading, setLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [_deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState("")

  // Tab state
  const [activeTab, setActiveTab] = useState<
    "domains" | "feedback" | "organizations" | "users" | "templates" | "settings"
  >("domains")

  // Sources state (multi-source domain data)
  const [sources, setSources] = useState<SourceData[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)

  // Feedback state
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  // Templates state
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null)

  // Users state
  const [_creatingUser, setCreatingUser] = useState(false)

  // Organizations state
  const [orgs, setOrgs] = useState<ManagerOrganization[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [newOrgCredits, setNewOrgCredits] = useState("")
  const [updatingOrgCredits, setUpdatingOrgCredits] = useState(false)
  const [deletingOrg, setDeletingOrg] = useState<string | null>(null)
  const [addMemberOrgId, setAddMemberOrgId] = useState<string | null>(null)
  const [availableUsers, setAvailableUsers] = useState<
    Array<{ user_id: string; email: string; display_name: string | null }>
  >([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedRole, setSelectedRole] = useState<OrgRole>("member")
  const [addingMember, setAddingMember] = useState(false)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [transferringOwnership, setTransferringOwnership] = useState<string | null>(null)
  const [transferringDomain, setTransferringDomain] = useState<string | null>(null)
  const [creatingOrg, setCreatingOrg] = useState(false)

  // Settings actions state
  const [reloadingCaddy, setReloadingCaddy] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [cleaningTestData, setCleaningTestData] = useState(false)
  const [testDataStats, setTestDataStats] = useState<CleanupStats | null>(null)

  // Service status state
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)

  // Login form state
  const [showLogin, setShowLogin] = useState(false)
  const [pass, setPass] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState("")

  // Permissions check state
  const [permissionsModal, setPermissionsModal] = useState<string | null>(null)
  const [permissionsData, setPermissionsData] = useState<PermissionCheckResult | null>(null)
  const [checkingPermissions, setCheckingPermissions] = useState(false)
  const [fixingPermissions, setFixingPermissions] = useState(false)

  // Confirmation modals state
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState<string | null>(null)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ orgId: string; userId: string } | null>(null)
  const [confirmTransferOwnership, setConfirmTransferOwnership] = useState<{
    orgId: string
    newOwnerId: string
    newOwnerName: string
  } | null>(null)
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<{ id: string; name: string } | null>(null)
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<string | null>(null)

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true)
    const startTime = performance.now()
    try {
      const response = await fetch("/api/manager/feedback")
      const fetchTime = performance.now() - startTime

      if (!response.ok) {
        console.error("Failed to fetch feedback:", response.status, response.statusText)
        toast.error("Failed to fetch feedback")
        return
      }
      const data = await response.json()

      // Log debug timings
      if (data.debug?.timings) {
        console.log("[Feedback] Performance:", {
          network_ms: Math.round(fetchTime * 100) / 100,
          ...data.debug.timings,
        })
      }

      if (data.ok) {
        setFeedback(data.feedback)
      } else {
        toast.error("Failed to fetch feedback")
      }
    } catch (error) {
      console.error("Failed to fetch feedback:", error)
      toast.error("Failed to fetch feedback")
    } finally {
      setFeedbackLoading(false)
    }
  }, [])

  const fetchOrgs = useCallback(async () => {
    setOrgsLoading(true)
    setFeedbackLoading(true)
    try {
      const data = await getty("manager/orgs")
      setOrgs(data.orgs)
      // Set feedback from the same response (loosely typed in schema)
      if (data.feedback) {
        setFeedback(data.feedback as unknown as FeedbackEntry[])
      }
    } catch (error) {
      console.error("Failed to fetch organizations:", error)
      toast.error("Failed to fetch organizations")
    } finally {
      setOrgsLoading(false)
      setFeedbackLoading(false)
    }
  }, [])

  const fetchStatuses = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const response = await fetch("/api/manager/status")
      if (!response.ok) {
        console.log("Domain status check skipped (endpoint not implemented)")
        return
      }
      const data = await response.json()
      if (data.ok && data.statuses) {
        const statusMap = data.statuses.reduce((acc: Record<string, DomainStatus>, status: DomainStatus) => {
          acc[status.domain] = status
          return acc
        }, {})
        setStatuses(statusMap)
      }
    } catch (error) {
      console.error("Failed to fetch statuses:", error)
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  const fetchSources = useCallback(async () => {
    setSourcesLoading(true)
    try {
      const response = await fetch("/api/manager/sources")
      if (!response.ok) {
        console.error("Failed to fetch sources:", response.status, response.statusText)
        toast.error("Failed to fetch source data")
        return
      }

      const data = await response.json()
      if (data.ok) {
        setSources(data.sources)
        console.log("[Sources] Data loaded:", data.sources.length, "domains")
      }
    } catch (error) {
      console.error("Failed to fetch sources:", error)
      toast.error("Failed to fetch source data")
    } finally {
      setSourcesLoading(false)
    }
  }, [])

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const data = await getty("manager/templates")
      if (data.ok) {
        setTemplates(data.templates)
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error)
      toast.error(error instanceof ApiError ? error.message : "Failed to fetch templates")
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  const fetchDomains = useCallback(async () => {
    try {
      const response = await fetch("/api/manager")

      if (!response.ok) {
        console.error("Failed to fetch domains:", response.status, response.statusText)
        setLoading(false)
        return
      }

      const data = await response.json()
      if (data.ok) {
        setDomains(data.domains)
      }
    } catch (error) {
      console.error("Failed to fetch domains:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuthentication()
  }, [])

  // Removed automatic status polling - status checks are now manual only via "Refresh status" button
  // Status checks take 20+ seconds and should never block other data loading

  useEffect(() => {
    if (activeTab === "feedback" && authenticated) {
      // Feedback is now loaded with orgs, only fetch if not already loaded
      if (feedback.length === 0) {
        fetchFeedback()
      }
    }
  }, [activeTab, authenticated, feedback.length, fetchFeedback])

  useEffect(() => {
    if (activeTab === "domains" && authenticated) {
      fetchSources()
    }
  }, [activeTab, authenticated, fetchSources])

  useEffect(() => {
    if ((activeTab === "organizations" || activeTab === "users" || activeTab === "feedback") && authenticated) {
      fetchOrgs()
      // Also fetch users for the create org modal
      if (activeTab === "organizations") {
        fetchUsers()
      }
    }
  }, [activeTab, authenticated, fetchOrgs])

  useEffect(() => {
    if (activeTab === "templates" && authenticated) {
      fetchTemplates()
    }
  }, [activeTab, authenticated, fetchTemplates])

  const checkAuthentication = async () => {
    try {
      const response = await fetch("/api/manager")
      if (response.ok) {
        setAuthenticated(true)
        setShowLogin(false)
        fetchDomains()
      } else {
        setAuthenticated(false)
        setShowLogin(true)
        setLoading(false)
      }
    } catch (error) {
      console.error("Authentication check failed:", error)
      setAuthenticated(false)
      setShowLogin(true)
      setLoading(false)
    }
  }

  const _openPasswordDialog = (domain: string) => {
    setSelectedDomain(domain)
    setNewPassword("")
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setSelectedDomain(null)
    setNewPassword("")
  }

  const updateDomainSettings = async () => {
    if (!selectedDomain) {
      return
    }

    // Validate: password must be provided
    if (!newPassword.trim()) {
      toast.error("Password is required")
      return
    }

    setSaving(selectedDomain)
    try {
      const payload: { domain: string; password: string } = {
        domain: selectedDomain,
        password: newPassword,
      }

      const response = await fetch("/api/manager", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast.success("Password updated successfully")
        closeDialog()
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to update")
      }
    } catch (error) {
      console.error("Failed to update:", error)
      toast.error("Failed to update")
    } finally {
      setSaving(null)
    }
  }

  const deleteDomain = async (domain: string) => {
    await executeHandler({
      fn: () => domainService.deleteDomain(domain),
      onLoading: loading => setDeleting(loading ? domain : null),
      successMessage: "Domain deleted successfully",
      errorMessage: "Failed to delete domain",
      onSuccess: () => {
        setDomains(prev => {
          const newDomains = { ...prev }
          delete newDomains[domain]
          return newDomains
        })
        setStatuses(prev => {
          const newStatuses = { ...prev }
          delete newStatuses[domain]
          return newStatuses
        })
        // Refresh sources table
        fetchSources()
      },
    })
  }

  const _handleDelete = (domain: string) => {
    setDeleteConfirm(domain)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    await deleteDomain(deleteConfirm)
    setDeleteConfirm(null)
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        resetPostHogIdentity()
        // Reset state to show login form again
        setAuthenticated(false)
        setShowLogin(true)
        setDomains({})
        setPass("")
        setLoginError("")
      } else {
        toast.error("Failed to logout")
      }
    } catch (error) {
      console.error("Logout failed:", error)
      toast.error("Failed to logout")
    } finally {
      setLoggingOut(false)
    }
  }

  const handleManagerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError("")

    try {
      const response = await fetch("/api/login-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: pass }),
      })

      if (response.ok) {
        setAuthenticated(true)
        setShowLogin(false)
        fetchDomains()
      } else {
        setLoginError("Invalid manager passcode")
      }
    } catch (error) {
      console.error("Manager login failed:", error)
      setLoginError("Connection failed")
    } finally {
      setLoginLoading(false)
    }
  }

  if (!authenticated) {
    if (loading) {
      return (
        <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
          <div className="text-xl text-black dark:text-white">Checking authentication...</div>
        </div>
      )
    }

    if (showLogin) {
      return (
        <main className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
          <div className="w-80">
            <h1 className="text-6xl font-normal mb-8 text-black dark:text-white">•</h1>
            <p className="text-black/60 dark:text-white/60 text-center mb-8">Manager Access</p>

            <form onSubmit={handleManagerLogin} className="space-y-8" autoComplete="off">
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="manager passcode"
                disabled={loginLoading}
                autoComplete="new-password"
                autoSave="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                className="w-full bg-transparent border-0 border-b border-black/20 dark:border-white/20 text-black dark:text-white placeholder-black/40 dark:placeholder-white/40 focus:outline-none focus:border-black dark:focus:border-white pb-3 text-lg font-normal"
              />

              {loginError && <p className="text-black/60 dark:text-white/60 text-sm">{loginError}</p>}

              <Button
                type="submit"
                fullWidth
                loading={loginLoading}
                disabled={!pass.trim()}
                className="!bg-black dark:!bg-white !text-white dark:!text-black hover:!bg-black/90 dark:hover:!bg-white/90 !border-0 !font-normal !text-lg !py-4"
              >
                enter manager
              </Button>
            </form>
          </div>
        </main>
      )
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-xl text-black dark:text-white">Loading domains...</div>
      </div>
    )
  }

  const _getStatusColor = (domain: string) => {
    const status = statuses[domain]
    if (!status) return "bg-gray-300 animate-pulse"
    if (status.httpsAccessible) return "bg-green-500"
    if (status.httpAccessible) return "bg-yellow-500"
    if (status.portListening) return "bg-orange-500"
    return "bg-red-500"
  }

  const _getStatusText = (domain: string) => {
    const status = statuses[domain]
    if (!status) return "Checking"
    if (status.httpsAccessible) return "Online"
    if (status.httpAccessible) return "HTTP only"
    if (status.portListening) return "Port open"
    return "Offline"
  }

  const _getStatusDetails = (domain: string) => {
    const status = statuses[domain]
    if (!status) return "Status unknown"
    const parts = []
    if (status.httpsAccessible) parts.push("HTTPS ✓")
    else if (status.httpAccessible) parts.push("HTTP ✓")
    if (status.portListening) parts.push("Port listening")
    return parts.length > 0 ? parts.join(" • ") : "Not accessible"
  }

  const _getInfrastructureChecks = (domain: string) => {
    const status = statuses[domain]
    if (!status) return null

    return [
      {
        label: "DNS",
        pass: status.dnsPointsToServer,
        detail: status.dnsPointsToServer
          ? status.dnsIsProxied
            ? `verified via ${status.dnsVerificationMethod || "https"} (proxied)`
            : `verified via ${status.dnsVerificationMethod || "direct"}`
          : status.dnsResolvedIp
            ? `points to ${status.dnsResolvedIp} (verification failed)`
            : "not resolved",
      },
      {
        label: "Port",
        pass: !status.vitePortMismatch,
        detail: status.vitePortMismatch
          ? status.hasSystemdPortOverride
            ? `systemd override + config: ${status.viteActualPort}, expected: ${status.viteExpectedPort}`
            : `config: ${status.viteActualPort}, expected: ${status.viteExpectedPort}`
          : status.viteActualPort
            ? `${status.viteActualPort}`
            : "not configured",
      },
      {
        label: "Systemd",
        pass: status.systemdServiceExists && status.systemdServiceRunning,
        detail: status.systemdServiceExists ? (status.systemdServiceRunning ? "running" : "stopped") : "missing",
      },
      {
        label: "Caddy",
        pass: status.caddyConfigured,
        detail: status.caddyConfigured ? "configured" : "not configured",
      },
      { label: "Files", pass: status.siteDirectoryExists, detail: status.siteDirectoryExists ? "exists" : "missing" },
    ]
  }

  const _formatCreatedDate = (isoDate: string | null): string => {
    if (!isoDate) return "Unknown"
    const date = new Date(isoDate)
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  }

  const checkServiceStatus = async () => {
    setCheckingStatus(true)
    try {
      const data = await settingsService.checkServiceStatus()
      setServiceStatus(data)
    } catch (error) {
      console.error("Failed to check service status:", error)
      toast.error("Failed to check service status")
    } finally {
      setCheckingStatus(false)
    }
  }

  const handleReloadCaddy = async () => {
    await executeHandler({
      fn: () => settingsService.reloadCaddy(),
      onLoading: setReloadingCaddy,
      successMessage: "Caddy reloaded successfully",
      errorMessage: "Failed to reload Caddy",
    })
  }

  const handleBackupWebsites = async () => {
    await executeHandler({
      fn: () => settingsService.backupWebsites(),
      onLoading: setBackingUp,
      successMessage: "Websites backed up successfully to GitHub",
      errorMessage: "Failed to backup websites",
    })
  }

  const handleCleanupTestData = async (dryRun: boolean = true) => {
    setTestDataStats(null)
    await executeHandler({
      fn: () => settingsService.cleanupTestData(dryRun),
      onLoading: setCleaningTestData,
      successMessage: dryRun ? "Preview generated" : "Cleanup complete",
      errorMessage: "Failed to clean up test data",
      onSuccess: stats => {
        setTestDataStats(stats)
        if (!dryRun) {
          fetchOrgs()
        }
      },
    })
  }

  const handleUpdateOrgCredits = async (orgId: string, credits: number) => {
    await executeHandler({
      fn: () => orgService.updateOrgCredits(orgId, credits),
      onLoading: setUpdatingOrgCredits,
      successMessage: "Organization credits updated",
      errorMessage: "Failed to update organization credits",
      onSuccess: () => {
        setOrgs(prev => prev.map(org => (org.org_id === orgId ? { ...org, credits } : org)))
        setSelectedOrg(null)
        setNewOrgCredits("")
      },
    })
  }

  const handleDeleteOrg = async (orgId: string) => {
    setConfirmDeleteOrg(orgId)
  }

  const executeDeleteOrg = async (orgId: string) => {
    setConfirmDeleteOrg(null)
    await executeHandler({
      fn: () => orgService.deleteOrg(orgId),
      onLoading: loading => setDeletingOrg(loading ? orgId : null),
      successMessage: "Organization deleted",
      errorMessage: "Failed to delete organization",
      onSuccess: () => setOrgs(prev => prev.filter(org => org.org_id !== orgId)),
    })
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/manager/users")
      const data = await response.json()
      if (data.ok) {
        setAvailableUsers(data.users)
      } else {
        toast.error("Failed to fetch users")
      }
    } catch (error) {
      console.error("Failed to fetch users:", error)
      toast.error("Failed to fetch users")
    }
  }

  const handleAddMember = async () => {
    if (!addMemberOrgId || !selectedUserId) return

    await executeHandler({
      fn: () => orgService.addOrgMember(addMemberOrgId, selectedUserId, selectedRole),
      onLoading: setAddingMember,
      successMessage: "Member added successfully",
      errorMessage: "Failed to add member",
      onSuccess: () => {
        setAddMemberOrgId(null)
        setSelectedUserId("")
        setSelectedRole("member")
        fetchOrgs()
      },
    })
  }

  const handleRemoveMember = async (orgId: string, userId: string) => {
    setConfirmRemoveMember({ orgId, userId })
  }

  const executeRemoveMember = async (orgId: string, userId: string) => {
    setConfirmRemoveMember(null)
    await executeHandler({
      fn: () => orgService.removeMember(orgId, userId),
      onLoading: loading => setRemovingMember(loading ? userId : null),
      successMessage: "Member removed",
      errorMessage: "Failed to remove member",
      onSuccess: fetchOrgs,
    })
  }

  const handleTransferOwnership = async (orgId: string, newOwnerId: string, newOwnerName: string) => {
    setConfirmTransferOwnership({ orgId, newOwnerId, newOwnerName })
  }

  const executeTransferOwnership = async (orgId: string, newOwnerId: string) => {
    setConfirmTransferOwnership(null)
    await executeHandler({
      fn: () => orgService.transferOwnership(orgId, newOwnerId),
      onLoading: loading => setTransferringOwnership(loading ? newOwnerId : null),
      successMessage: "Ownership transferred successfully",
      errorMessage: "Failed to transfer ownership",
      onSuccess: fetchOrgs,
    })
  }

  const handleTransferDomain = async (domain: string, _currentOrgId: string, targetOrgId: string) => {
    await executeHandler({
      fn: () => domainTransferService.transferDomain(domain, targetOrgId),
      onLoading: loading => setTransferringDomain(loading ? domain : null),
      successMessage: `Domain ${domain} transferred successfully`,
      errorMessage: "Failed to transfer domain",
      onSuccess: fetchOrgs,
    })
  }

  const handleCreateOrg = async (name: string, credits: number, ownerUserId?: string) => {
    await executeHandler({
      fn: () => orgService.createOrg({ name, credits, ownerUserId }),
      onLoading: setCreatingOrg,
      successMessage: "Organization created successfully",
      errorMessage: "Failed to create organization",
      onSuccess: fetchOrgs,
    })
  }

  const handleCheckPermissions = async (domain: string) => {
    setPermissionsModal(domain)
    await executeHandler({
      fn: () => domainService.checkPermissions(domain),
      onLoading: setCheckingPermissions,
      successMessage: "Permissions checked",
      errorMessage: "Failed to check permissions",
      onSuccess: data => setPermissionsData(data),
      logError: false,
    }).catch(() => setPermissionsModal(null))
  }

  const handleFixPermissions = async (domain: string) => {
    await executeHandler({
      fn: () => domainService.fixPermissions(domain),
      onLoading: setFixingPermissions,
      successMessage: "Permissions fixed successfully",
      errorMessage: "Failed to fix permissions",
      onSuccess: data => setPermissionsData(data.result),
    })
  }

  const closePermissionsModal = () => {
    setPermissionsModal(null)
    setPermissionsData(null)
  }

  const _handleFixPort = async (domain: string) => {
    await executeHandler({
      fn: () => domainService.fixPort(domain),
      onLoading: () => {},
      successMessage: "Port fixed and service restarted",
      errorMessage: "Failed to fix port",
      onSuccess: fetchStatuses,
    })
  }

  // Template handlers
  const handleSaveTemplate = async (template: Partial<Template> & { template_id: string }) => {
    setSavingTemplate(template.template_id)
    try {
      const validated = validateRequest("manager/templates/update", template)
      const data = await putty("manager/templates/update", validated, undefined, "/api/manager/templates")
      if (data.ok) {
        toast.success("Template saved")
        setTemplates(prev => prev.map(t => (t.template_id === template.template_id ? data.template : t)))
      }
    } catch (error) {
      console.error("Failed to save template:", error)
      toast.error(error instanceof ApiError ? error.message : "Failed to save template")
    } finally {
      setSavingTemplate(null)
    }
  }

  const handleDeleteTemplate = (templateId: string) => {
    const template = templates.find(t => t.template_id === templateId)
    setConfirmDeleteTemplate({ id: templateId, name: template?.name || templateId })
  }

  const executeDeleteTemplate = async (templateId: string) => {
    setConfirmDeleteTemplate(null)
    setDeletingTemplate(templateId)
    try {
      const data = await delly(
        "manager/templates/delete",
        undefined,
        `/api/manager/templates?template_id=${templateId}`,
      )
      if (data.ok) {
        toast.success("Template deleted")
        setTemplates(prev => prev.filter(t => t.template_id !== templateId))
      }
    } catch (error) {
      console.error("Failed to delete template:", error)
      toast.error(error instanceof ApiError ? error.message : "Failed to delete template")
    } finally {
      setDeletingTemplate(null)
    }
  }

  const handleAddTemplate = async (template: Omit<Template, "template_id"> & { template_id?: string }) => {
    try {
      const validated = validateRequest("manager/templates/create", template)
      const data = await postty("manager/templates/create", validated, undefined, "/api/manager/templates")
      if (data.ok) {
        toast.success("Template added")
        setTemplates(prev => [...prev, data.template])
      }
    } catch (error) {
      console.error("Failed to add template:", error)
      toast.error(error instanceof ApiError ? error.message : "Failed to add template")
    }
  }

  const handleDeleteDomain = (domain: string) => {
    setConfirmDeleteDomain(domain)
  }

  const executeDeleteDomain = async (domain: string) => {
    setConfirmDeleteDomain(null)
    await deleteDomain(domain)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-6 sm:mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">Manager</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Manage domains, organizations, and system configuration
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={fetchStatuses}
                disabled={loadingStatus}
                className="inline-flex items-center px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#2a2a2a] border border-slate-300 dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-[#333] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingStatus ? "Refreshing..." : "Refresh status"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white dark:text-black bg-slate-900 dark:bg-white border border-transparent rounded-md hover:bg-slate-800 dark:hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white dark:bg-[#2a2a2a] rounded-lg border border-slate-200 dark:border-white/10">
          {/* Tabs */}
          <div className="border-b border-slate-200 dark:border-white/10">
            <nav className="flex px-4 sm:px-6 overflow-x-auto scrollbar-hide -mb-px" aria-label="Tabs">
              <button
                type="button"
                onClick={() => setActiveTab("domains")}
                className={`relative py-3 sm:py-4 px-1 mr-4 sm:mr-8 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === "domains"
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Domains
                {activeTab === "domains" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("feedback")}
                className={`relative py-3 sm:py-4 px-1 mr-4 sm:mr-8 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === "feedback"
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Feedback
                {activeTab === "feedback" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("organizations")}
                className={`relative py-3 sm:py-4 px-1 mr-4 sm:mr-8 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === "organizations"
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Orgs
                {activeTab === "organizations" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
                {orgs.length > 0 && (
                  <span className="ml-1.5 sm:ml-2 inline-flex items-center px-1.5 sm:px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                    {orgs.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className={`relative py-3 sm:py-4 px-1 mr-4 sm:mr-8 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === "users"
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Users
                {activeTab === "users" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("templates")}
                className={`relative py-3 sm:py-4 px-1 mr-4 sm:mr-8 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === "templates"
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Templates
                {activeTab === "templates" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
                {templates.length > 0 && (
                  <span className="ml-1.5 sm:ml-2 inline-flex items-center px-1.5 sm:px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                    {templates.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={`relative py-3 sm:py-4 px-1 mr-4 sm:mr-8 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === "settings"
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Settings
                {activeTab === "settings" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
            </nav>
          </div>

          {activeTab === "domains" && (
            <SourcesTable sources={sources} loading={sourcesLoading} onDelete={handleDeleteDomain} />
          )}

          {activeTab === "feedback" && (
            <FeedbackList feedback={feedback} loading={feedbackLoading} onRefresh={fetchFeedback} />
          )}

          {activeTab === "organizations" && (
            <OrganizationsList
              orgs={orgs}
              loading={orgsLoading}
              deleting={deletingOrg}
              transferring={transferringOwnership}
              removing={removingMember}
              creating={creatingOrg}
              onRefresh={fetchOrgs}
              onAddMember={orgId => {
                setAddMemberOrgId(orgId)
                fetchUsers()
              }}
              onDelete={handleDeleteOrg}
              onRemoveMember={handleRemoveMember}
              onTransferOwnership={handleTransferOwnership}
              onEditCredits={(orgId, credits) => {
                setSelectedOrg(orgId)
                setNewOrgCredits(String(credits))
              }}
              onTransferDomain={handleTransferDomain}
              transferringDomain={transferringDomain}
              onCreateOrg={handleCreateOrg}
              availableUsers={availableUsers}
            />
          )}

          {activeTab === "users" && <UsersPanel orgs={orgs} onSuccess={fetchOrgs} onLoading={setCreatingUser} />}

          {activeTab === "templates" && (
            <TemplatesList
              templates={templates}
              loading={templatesLoading}
              onRefresh={fetchTemplates}
              onSave={handleSaveTemplate}
              onDelete={handleDeleteTemplate}
              onAdd={handleAddTemplate}
              saving={savingTemplate}
              deleting={deletingTemplate}
            />
          )}

          {activeTab === "settings" && (
            <SettingsPanel
              serviceStatus={serviceStatus}
              checkingStatus={checkingStatus}
              reloadingCaddy={reloadingCaddy}
              loadingStatus={loadingStatus}
              backingUp={backingUp}
              cleaningTestData={cleaningTestData}
              testDataStats={testDataStats}
              onCheckStatus={checkServiceStatus}
              onReloadCaddy={handleReloadCaddy}
              onRefreshDomains={fetchStatuses}
              onBackupWebsites={handleBackupWebsites}
              onCleanupTestData={handleCleanupTestData}
            />
          )}
        </div>
      </div>

      <Toaster
        position="top-right"
        containerStyle={{
          zIndex: 9999,
        }}
        toastOptions={{
          duration: 3000,
          style: {
            background: "#363636",
            color: "#fff",
          },
          success: {
            style: {
              background: "#10B981",
            },
          },
          error: {
            style: {
              background: "#EF4444",
            },
          },
        }}
      />

      {dialogOpen && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeDialog}
          onKeyDown={e => {
            if (e.key === "Escape") closeDialog()
          }}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl w-full max-w-lg p-6 sm:p-8"
            role="document"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Edit Domain Settings</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage credentials and access for{" "}
                <span className="font-mono font-medium text-gray-900 dark:text-white">{selectedDomain}</span>
              </p>
            </div>

            <div className="space-y-8 mb-8">
              <div className="border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-900/20 p-4 rounded">
                <label
                  htmlFor="password-input"
                  className="block text-sm font-semibold text-gray-900 dark:text-white mb-2"
                >
                  Access Password
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Used to authenticate workspace access in Claude Code. Leave blank to keep current password unchanged.
                </p>
                <input
                  id="password-input"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      updateDomainSettings()
                    }
                    if (e.key === "Escape") {
                      closeDialog()
                    }
                  }}
                  placeholder="Leave blank to keep current"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-white/10 pt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving === selectedDomain}
                className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#333] rounded-md hover:bg-gray-200 dark:hover:bg-[#444] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={updateDomainSettings}
                disabled={saving === selectedDomain || !newPassword.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {saving === selectedDomain ? "Saving..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <DeleteModal
          title={`Delete ${deleteConfirm}?`}
          message={
            <div className="space-y-2">
              <p>This will permanently remove:</p>
              <ul className="text-left inline-block">
                <li>• Systemd service</li>
                <li>• Site directory and files</li>
                <li>• Caddy configuration</li>
                {!domains[deleteConfirm]?.orphaned && <li>• Password registry entry</li>}
              </ul>
              <p className="font-medium text-red-600 mt-4">This action cannot be undone.</p>
            </div>
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {permissionsModal && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closePermissionsModal}
          onKeyDown={e => {
            if (e.key === "Escape") closePermissionsModal()
          }}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl w-full max-w-2xl p-4 sm:p-6 max-h-[80vh] overflow-y-auto"
            role="document"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">File Permissions</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{permissionsModal}</p>
              </div>
              <button
                type="button"
                onClick={closePermissionsModal}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            {checkingPermissions ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Checking permissions...</p>
              </div>
            ) : permissionsData ? (
              <div className="space-y-4">
                {permissionsData.error ? (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-300 font-medium">{permissionsData.error}</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Expected Owner</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {permissionsData.expectedOwner}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Files</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {permissionsData.totalFiles}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div
                        className={`border rounded-lg p-4 ${
                          permissionsData.rootOwnedFiles > 0
                            ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                            : "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-gray-900 dark:text-white">Root-Owned Files</p>
                          <span
                            className={`text-2xl font-bold ${
                              permissionsData.rootOwnedFiles > 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-green-600 dark:text-green-400"
                            }`}
                          >
                            {permissionsData.rootOwnedFiles}
                          </span>
                        </div>
                        {permissionsData.rootOwnedFiles > 0 && permissionsData.rootOwnedFilesList.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Sample files:</p>
                            {permissionsData.rootOwnedFilesList.map((file: string, i: number) => (
                              <p
                                key={i}
                                className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate"
                                title={file}
                              >
                                {file}
                              </p>
                            ))}
                            {permissionsData.rootOwnedFiles > 10 && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                ... and {permissionsData.rootOwnedFiles - 10} more
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div
                        className={`border rounded-lg p-4 ${
                          permissionsData.wrongOwnerFiles > 0
                            ? "border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20"
                            : "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-gray-900 dark:text-white">Wrong Owner Files</p>
                          <span
                            className={`text-2xl font-bold ${
                              permissionsData.wrongOwnerFiles > 0
                                ? "text-orange-600 dark:text-orange-400"
                                : "text-green-600 dark:text-green-400"
                            }`}
                          >
                            {permissionsData.wrongOwnerFiles}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Files not owned by {permissionsData.expectedOwner}
                        </p>
                        {permissionsData.wrongOwnerFiles > 0 && permissionsData.wrongOwnerFilesList.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">Sample files:</p>
                            {permissionsData.wrongOwnerFilesList.map((file: string, i: number) => (
                              <p
                                key={i}
                                className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate"
                                title={file}
                              >
                                {file}
                              </p>
                            ))}
                            {permissionsData.wrongOwnerFiles > 10 && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                ... and {permissionsData.wrongOwnerFiles - 10} more
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {permissionsData.wrongOwnerFiles > 0 && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <p className="text-sm text-yellow-800 dark:text-yellow-300">
                          ⚠️ Files with incorrect ownership detected. Click "Fix Permissions" to update all files to the
                          correct owner.
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
                      <button
                        type="button"
                        onClick={closePermissionsModal}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#333] rounded-md hover:bg-gray-200 dark:hover:bg-[#444] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        Close
                      </button>
                      {permissionsData.wrongOwnerFiles > 0 && (
                        <button
                          type="button"
                          onClick={() => handleFixPermissions(permissionsModal)}
                          disabled={fixingPermissions}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {fixingPermissions ? "Fixing..." : "Fix Permissions"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCheckPermissions(permissionsModal)}
                        disabled={checkingPermissions}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {checkingPermissions ? "Checking..." : "Recheck"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {selectedOrg && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setSelectedOrg(null)
            setNewOrgCredits("")
          }}
          onKeyDown={e => {
            if (e.key === "Escape") {
              setSelectedOrg(null)
              setNewOrgCredits("")
            }
          }}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl w-full max-w-lg p-6 sm:p-8"
            role="document"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Edit Organization Credits</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage API credits for{" "}
                <span className="font-mono font-medium text-gray-900 dark:text-white">
                  {orgs.find(o => o.org_id === selectedOrg)?.name}
                </span>
              </p>
            </div>

            <div className="mb-8">
              <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4 rounded">
                <label
                  htmlFor="org-credits-input"
                  className="block text-sm font-semibold text-gray-900 dark:text-white mb-2"
                >
                  Organization Credits
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Total API credits available for all members of this organization. Each member can use these credits
                  for Claude requests.
                </p>
                <input
                  id="org-credits-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newOrgCredits}
                  onChange={e => setNewOrgCredits(e.target.value)}
                  placeholder="200"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={e => {
                    if (e.key === "Enter" && newOrgCredits) {
                      handleUpdateOrgCredits(selectedOrg, parseFloat(newOrgCredits))
                    }
                  }}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 font-medium">
                  Current:{" "}
                  <span className="text-gray-700 dark:text-gray-300">
                    {orgs.find(o => o.org_id === selectedOrg)?.credits.toFixed(2)}
                  </span>{" "}
                  credits
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-white/10 pt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedOrg(null)
                  setNewOrgCredits("")
                }}
                disabled={updatingOrgCredits}
                className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#333] rounded-md hover:bg-gray-200 dark:hover:bg-[#444] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUpdateOrgCredits(selectedOrg, parseFloat(newOrgCredits))}
                disabled={updatingOrgCredits || !newOrgCredits}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {updatingOrgCredits ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addMemberOrgId && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setAddMemberOrgId(null)
            setSelectedUserId("")
            setSelectedRole("member")
          }}
          onKeyDown={e => {
            if (e.key === "Escape") {
              setAddMemberOrgId(null)
              setSelectedUserId("")
              setSelectedRole("member")
            }
          }}
        >
          <div
            className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl w-full max-w-lg p-6 sm:p-8"
            role="document"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Add Member to Organization</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add a new member to{" "}
                <span className="font-mono font-medium text-gray-900 dark:text-white">
                  {orgs.find(o => o.org_id === addMemberOrgId)?.name}
                </span>
              </p>
            </div>

            <div className="space-y-6 mb-8">
              <div>
                <label htmlFor="user-select" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Select User
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Choose an existing user account to add to this organization.
                </p>
                <select
                  id="user-select"
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a user...</option>
                  {availableUsers.map(user => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name || user.email} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="role-select" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Assign Role
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  <span className="font-medium">Member</span> can access organization resources,{" "}
                  <span className="font-medium">Admin</span> can manage members,{" "}
                  <span className="font-medium">Owner</span> has full control.
                </p>
                <select
                  id="role-select"
                  value={selectedRole}
                  onChange={e => {
                    if (isOrgRole(e.target.value)) {
                      setSelectedRole(e.target.value)
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-white/10 pt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setAddMemberOrgId(null)
                  setSelectedUserId("")
                  setSelectedRole("member")
                }}
                disabled={addingMember}
                className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#333] rounded-md hover:bg-gray-200 dark:hover:bg-[#444] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddMember}
                disabled={addingMember || !selectedUserId}
                className="px-5 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {addingMember ? "Adding..." : "Add Member"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteOrg && (
        <ConfirmModal
          title="Delete Organization?"
          message="This will permanently remove the organization and all its members. This action cannot be undone."
          confirmText="Delete"
          confirmStyle="danger"
          onConfirm={() => executeDeleteOrg(confirmDeleteOrg)}
          onCancel={() => setConfirmDeleteOrg(null)}
        />
      )}

      {confirmRemoveMember && (
        <ConfirmModal
          title="Remove Member?"
          message="Are you sure you want to remove this member from the organization?"
          confirmText="Remove"
          confirmStyle="danger"
          onConfirm={() => executeRemoveMember(confirmRemoveMember.orgId, confirmRemoveMember.userId)}
          onCancel={() => setConfirmRemoveMember(null)}
        />
      )}

      {confirmTransferOwnership && (
        <ConfirmModal
          title="Transfer Ownership?"
          message={`Transfer ownership to ${confirmTransferOwnership.newOwnerName}? The current owner will become an admin.`}
          confirmText="Transfer"
          confirmStyle="warning"
          onConfirm={() =>
            executeTransferOwnership(confirmTransferOwnership.orgId, confirmTransferOwnership.newOwnerId)
          }
          onCancel={() => setConfirmTransferOwnership(null)}
        />
      )}

      {confirmDeleteTemplate && (
        <DeleteModal
          title="Delete Template?"
          message={
            <div className="space-y-2">
              <p>
                Are you sure you want to delete <strong>{confirmDeleteTemplate.name}</strong>?
              </p>
              <p className="text-sm">
                This will remove the template from the database. The source files will not be affected.
              </p>
            </div>
          }
          onConfirm={() => executeDeleteTemplate(confirmDeleteTemplate.id)}
          onCancel={() => setConfirmDeleteTemplate(null)}
        />
      )}

      {confirmDeleteDomain && (
        <DeleteModal
          title={`Delete ${confirmDeleteDomain}?`}
          message={
            <div className="space-y-2">
              <p>This will permanently remove:</p>
              <ul className="text-left inline-block">
                <li>• Systemd service</li>
                <li>• Site directory and files</li>
                <li>• Caddy configuration</li>
                <li>• Database records</li>
              </ul>
              <p className="font-medium text-red-600 mt-4">This action cannot be undone.</p>
            </div>
          }
          onConfirm={() => executeDeleteDomain(confirmDeleteDomain)}
          onCancel={() => setConfirmDeleteDomain(null)}
        />
      )}
    </div>
  )
}
