"use client"

import {
  Bot,
  Building2,
  ChevronDown,
  ClipboardList,
  Flag,
  Globe,
  Key,
  Link,
  Menu,
  Settings,
  Shield,
  Target,
  User,
  X,
  Zap,
} from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"
import { useAuth } from "@/features/deployment/hooks/useAuth"
import { useQueryState } from "nuqs"
import { QUERY_KEYS } from "@/lib/url/queryState"
import { SettingsTabLayout } from "./tabs/SettingsTabLayout"

// Lazy load tab components - same as SettingsModal
const AccountSettings = lazy(() =>
  import("@/components/settings/tabs/AccountSettings").then(m => ({ default: m.AccountSettings })),
)
const LLMSettings = lazy(() => import("@/components/settings/tabs/LLMSettings").then(m => ({ default: m.LLMSettings })))
const GoalSettings = lazy(() =>
  import("@/components/settings/tabs/GoalSettings").then(m => ({ default: m.GoalSettings })),
)
const UserPromptsSettings = lazy(() =>
  import("@/components/settings/tabs/UserPromptsSettings").then(m => ({ default: m.UserPromptsSettings })),
)
const WorkspaceSettings = lazy(() =>
  import("@/components/settings/tabs/WorkspaceSettings").then(m => ({ default: m.WorkspaceSettings })),
)
const WebsitesSettings = lazy(() =>
  import("@/components/settings/tabs/WebsitesSettings").then(m => ({ default: m.WebsitesSettings })),
)
const FlagsSettings = lazy(() =>
  import("@/components/settings/tabs/FlagsSettings").then(m => ({ default: m.FlagsSettings })),
)
const AdminSettings = lazy(() =>
  import("@/components/settings/tabs/AdminSettings").then(m => ({ default: m.AdminSettings })),
)
const IntegrationsList = lazy(() =>
  import("@/components/settings/integrations-list").then(m => ({ default: m.IntegrationsList })),
)
const UserEnvKeysSettings = lazy(() =>
  import("@/components/settings/user-env-keys").then(m => ({ default: m.UserEnvKeysSettings })),
)
const AutomationsSettings = lazy(() =>
  import("@/components/settings/tabs/AutomationsSettings").then(m => ({ default: m.AutomationsSettings })),
)

const SETTINGS_TABS = [
  "account",
  "llm",
  "goal",
  "skills",
  "organization",
  "websites",
  "automations",
  "integrations",
  "keys",
  "flags",
  "admin",
] as const

type SettingsTab = (typeof SETTINGS_TABS)[number]

interface TabDefinition {
  id: SettingsTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const allTabs: TabDefinition[] = [
  { id: "account", label: "Profile", icon: User },
  { id: "llm", label: "AI", icon: Bot },
  { id: "goal", label: "Project", icon: Target },
  { id: "skills", label: "Skills", icon: ClipboardList },
  { id: "organization", label: "Workspace", icon: Building2 },
  { id: "websites", label: "Websites", icon: Globe },
  { id: "automations", label: "Automations", icon: Zap },
  { id: "integrations", label: "Integrations", icon: Link },
  { id: "keys", label: "API Keys", icon: Key },
  { id: "flags", label: "Flags", icon: Flag, adminOnly: true },
  { id: "admin", label: "Admin", icon: Shield, adminOnly: true },
]

interface SettingsPageClientProps {
  onClose: () => void
  initialTab?: SettingsTab
}

export function SettingsPageClient({ onClose, initialTab }: SettingsPageClientProps) {
  const { user, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Mark hydration as complete after first render
  // This prevents hydration mismatch when user data loads asynchronously
  useEffect(() => {
    setHydrated(true)
  }, [])

  // Filter tabs based on admin status only after hydration completes
  // During initial hydration, show all tabs to prevent server/client mismatch
  const tabs = hydrated && !loading ? allTabs.filter(tab => !tab.adminOnly || !!user?.isAdmin) : allTabs

  // Use URL search params to persist active tab across page reloads
  const [activeTab, setActiveTab] = useQueryState(QUERY_KEYS.settingsTab, {
    defaultValue: initialTab || "account",
    parse: (value: string) => {
      const parsed = value as SettingsTab
      // Validate that the parsed value is a valid tab
      // Note: During hydration, tabs might not be fully loaded yet,
      // so we validate against ALL_TABS instead of filtered tabs
      if (SETTINGS_TABS.includes(parsed)) {
        return parsed
      }
      return initialTab || "account"
    },
    serialize: (value: string) => value,
  })

  const handleTabChange = (tabId: SettingsTab) => {
    void setActiveTab(tabId)
    setSidebarOpen(false)
  }

  // Derive effective tab - if activeTab points to an admin-only tab the user can't see,
  // fall back to the first available tab
  const effectiveTab = tabs.find(t => t.id === activeTab) || tabs[0]
  const currentTab = effectiveTab || { id: "account" as const, label: "Profile", icon: User }

  // Sync URL to effective tab if user doesn't have access to the URL-specified tab
  useEffect(() => {
    if (hydrated && !loading && effectiveTab && effectiveTab.id !== activeTab) {
      void setActiveTab(effectiveTab.id)
    }
  }, [hydrated, loading, effectiveTab, activeTab, setActiveTab])

  return (
    <div className="h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 relative z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700"
            aria-label="Toggle menu"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-left">
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              {currentTab.label}
              <ChevronDown className="w-3 h-3" />
            </p>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 -mr-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Close settings"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Sidebar Overlay */}
      <button
        type="button"
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={e => e.key === "Escape" && setSidebarOpen(false)}
        tabIndex={sidebarOpen ? 0 : -1}
        aria-label="Close menu"
      />

      {/* Left Sidebar */}
      <aside
        className={`
          fixed md:relative top-0 left-0 bottom-0 z-50
          w-64 md:w-52 h-full md:h-auto
          border-r border-zinc-200 dark:border-zinc-800
          bg-white dark:bg-zinc-900
          flex-shrink-0 flex flex-col
          transition-transform duration-200 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Desktop header */}
        <div className="hidden md:flex p-4 border-b border-zinc-200 dark:border-zinc-800 items-center justify-between">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-zinc-400" />
            Settings
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile close button area */}
        <div className="md:hidden p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-2 space-y-1 overflow-y-auto flex-1">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg md:rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800"
                }`}
              >
                <Icon className="w-5 h-5 md:w-4 md:h-4 flex-shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto px-4 md:px-8 py-2 md:py-0">
          <div className="max-w-3xl">
            <Suspense
              fallback={<div className="py-12 text-center text-zinc-400 dark:text-zinc-500 text-sm">Loading...</div>}
            >
              {activeTab === "account" && <AccountSettings />}
              {activeTab === "llm" && <LLMSettings />}
              {activeTab === "goal" && <GoalSettings />}
              {activeTab === "skills" && <UserPromptsSettings />}
              {activeTab === "organization" && <WorkspaceSettings />}
              {activeTab === "websites" && <WebsitesSettings />}
              {activeTab === "automations" && <AutomationsSettings />}
              {activeTab === "integrations" && <IntegrationsListWithHeader />}
              {activeTab === "keys" && <UserEnvKeysWithHeader />}
              {activeTab === "flags" && <FlagsSettings />}
              {activeTab === "admin" && <AdminSettings />}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

function IntegrationsListWithHeader() {
  return (
    <SettingsTabLayout title="Integrations" description="Connect external services to enhance your workspace">
      <IntegrationsList />
    </SettingsTabLayout>
  )
}

function UserEnvKeysWithHeader() {
  return (
    <SettingsTabLayout title="API Keys" description="Store custom API keys for MCP integrations">
      <UserEnvKeysSettings />
    </SettingsTabLayout>
  )
}
