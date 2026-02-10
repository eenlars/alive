"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

interface Service {
  service: string
  status: "operational" | "degraded" | "offline"
  message: string
  latency?: number
}

interface SettingsPanelProps {
  serviceStatus: { services: Service[]; timestamp: string } | null
  checkingStatus: boolean
  reloadingCaddy: boolean
  loadingStatus: boolean
  backingUp: boolean
  cleaningTestData: boolean
  testDataStats: any
  onCheckStatus: () => void
  onReloadCaddy: () => void
  onRefreshDomains: () => void
  onBackupWebsites: () => void
  onCleanupTestData: (preview: boolean) => void
}

export function SettingsPanel({
  serviceStatus,
  checkingStatus,
  reloadingCaddy,
  loadingStatus,
  backingUp,
  cleaningTestData,
  testDataStats,
  onCheckStatus,
  onReloadCaddy,
  onRefreshDomains,
  onBackupWebsites,
  onCleanupTestData,
}: SettingsPanelProps) {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-5 sm:space-y-6 p-4 sm:p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
      {/* Appearance Settings */}
      <div className="border border-slate-200 dark:border-white/10 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1a1a]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Customize the interface theme</p>
        </div>
        <div className="p-6">
          <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">Theme</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex flex-col items-center justify-center gap-2 p-4 border rounded transition-all duration-200 min-h-[96px] ${
                theme === "light"
                  ? "border-slate-900 dark:border-white bg-slate-900/5 dark:bg-white/5 shadow-sm"
                  : "border-slate-200 dark:border-white/20 hover:border-slate-900 dark:hover:border-white hover:shadow-sm"
              }`}
            >
              <Sun size={20} className="text-slate-900 dark:text-white" />
              <span className="text-xs text-slate-600 dark:text-slate-400 text-center">Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex flex-col items-center justify-center gap-2 p-4 border rounded transition-all duration-200 min-h-[96px] ${
                theme === "dark"
                  ? "border-slate-900 dark:border-white bg-slate-900/5 dark:bg-white/5 shadow-sm"
                  : "border-slate-200 dark:border-white/20 hover:border-slate-900 dark:hover:border-white hover:shadow-sm"
              }`}
            >
              <Moon size={20} className="text-slate-900 dark:text-white" />
              <span className="text-xs text-slate-600 dark:text-slate-400 text-center">Dark</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("system")}
              className={`flex flex-col items-center justify-center gap-2 p-4 border rounded transition-all duration-200 min-h-[96px] ${
                theme === "system"
                  ? "border-2 border-slate-900 dark:border-white bg-slate-900/5 dark:bg-white/5 shadow-sm"
                  : "border border-slate-200 dark:border-white/20 hover:border-slate-900 dark:hover:border-white hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-1">
                <Sun size={12} className="text-slate-900 dark:text-white" />
                <Moon size={12} className="text-slate-900 dark:text-white" />
              </div>
              <span className="text-xs font-medium text-slate-900 dark:text-white text-center">System</span>
            </button>
          </div>
        </div>
      </div>
      {/* External Services */}
      <div className="border border-slate-200 dark:border-white/10 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1a1a]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">External Services</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Groq API health for content safety checks</p>
        </div>
        <div className="p-6">
          {!serviceStatus ? (
            <div className="text-sm text-slate-600 dark:text-slate-400 text-center py-4">
              Click refresh to check service status
            </div>
          ) : (
            <div className="space-y-3">
              {serviceStatus.services.map((service: Service) => (
                <div
                  key={service.service}
                  className="flex items-center justify-between p-3 rounded border border-slate-200 dark:border-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        service.status === "operational"
                          ? "bg-emerald-500"
                          : service.status === "degraded"
                            ? "bg-amber-500"
                            : "bg-red-500"
                      }`}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">{service.service}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">{service.message}</div>
                    </div>
                  </div>
                  {service.latency !== undefined && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">{service.latency}ms</div>
                  )}
                </div>
              ))}
              <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 text-center">
                Last checked: {new Date(serviceStatus.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onCheckStatus}
            disabled={checkingStatus}
            className="mt-4 w-full text-xs px-3 py-2 text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {checkingStatus ? "Checking..." : "Check status"}
          </button>
        </div>
      </div>

      {/* Caddy */}
      <div className="border border-slate-200 dark:border-white/10 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1a1a]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Caddy Web Server</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Reload configuration from Caddyfile</p>
        </div>
        <div className="p-6">
          <button
            type="button"
            onClick={onReloadCaddy}
            disabled={reloadingCaddy}
            className="text-xs px-3 py-2 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {reloadingCaddy ? "Reloading..." : "Reload Caddy"}
          </button>
        </div>
      </div>

      {/* Domain Status */}
      <div className="border border-slate-200 dark:border-white/10 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1a1a]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Domain Status</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Check HTTP, HTTPS, systemd, Caddy, and file status
          </p>
        </div>
        <div className="p-6">
          <button
            type="button"
            onClick={onRefreshDomains}
            disabled={loadingStatus}
            className="text-xs px-3 py-2 text-slate-700 dark:text-slate-300 bg-white dark:bg-[#333] border border-slate-300 dark:border-white/10 rounded hover:bg-slate-50 dark:hover:bg-[#444] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingStatus ? "Checking..." : "Refresh all statuses"}
          </button>
        </div>
      </div>

      {/* Backup */}
      <div className="border border-slate-200 dark:border-white/10 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1a1a]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Backup Websites</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Push changes to GitHub (eenlars/all_websites)
          </p>
        </div>
        <div className="p-6">
          <button
            type="button"
            onClick={onBackupWebsites}
            disabled={backingUp}
            className="text-xs px-3 py-2 text-slate-700 dark:text-slate-300 bg-white dark:bg-[#333] border border-slate-300 dark:border-white/10 rounded hover:bg-slate-50 dark:hover:bg-[#444] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {backingUp ? "Backing up..." : "Backup to GitHub"}
          </button>
        </div>
      </div>

      {/* Cleanup Test Data */}
      <div className="border border-red-200 dark:border-red-800 rounded-lg">
        <div className="px-6 py-4 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-300">Clean Up Test Data</h3>
          <p className="text-xs text-red-700 dark:text-red-400 mt-1">Delete test users, organizations, and domains</p>
        </div>
        <div className="p-6">
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => onCleanupTestData(true)}
              disabled={cleaningTestData}
              className="text-xs px-3 py-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cleaningTestData ? "Checking..." : "Preview"}
            </button>
            <button
              type="button"
              onClick={() => onCleanupTestData(false)}
              disabled={cleaningTestData}
              className="text-xs px-3 py-2 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cleaningTestData ? "Deleting..." : "Delete"}
            </button>
          </div>
          {testDataStats && (
            <div className="p-3 bg-slate-50 dark:bg-[#1a1a1a] rounded border border-slate-200 dark:border-white/10 text-xs">
              <div className="font-medium text-slate-900 dark:text-white mb-2">Cleanup stats:</div>
              <div className="grid grid-cols-2 gap-1 text-slate-700 dark:text-slate-300">
                <div>Users deleted: {testDataStats.usersDeleted}</div>
                <div>Organizations deleted: {testDataStats.orgsDeleted}</div>
                <div>Domains deleted: {testDataStats.domainsDeleted}</div>
                <div>Memberships deleted: {testDataStats.membershipsDeleted}</div>
                <div>Invites deleted: {testDataStats.invitesDeleted}</div>
                <div>Sessions deleted: {testDataStats.sessionsDeleted}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
