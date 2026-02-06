"use client"

import { LogOut, Moon, Sun } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useAuth } from "@/features/deployment/hooks/useAuth"
import { useWorkspaceActions } from "@/lib/stores/workspaceStore"
import {
  dangerButton,
  readOnlyField,
  sectionDivider,
  selectionCardActive,
  selectionCardInactive,
  text,
} from "../styles"
import { SettingsTabLayout } from "./SettingsTabLayout"

export function AccountSettings() {
  // Get email from auth session (read-only)
  const { user } = useAuth()
  const router = useRouter()
  const { setCurrentWorkspace } = useWorkspaceActions()

  // Theme state
  const { theme, setTheme } = useTheme()

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme)
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      })
      // Clear workspace from store
      setCurrentWorkspace(null)
      // Redirect to login
      router.push("/")
    } catch (error) {
      console.error("Logout failed:", error)
    }
  }

  return (
    <SettingsTabLayout title="Profile" description="Your account information and preferences">
      <div className="space-y-4 sm:space-y-6">
        <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-75">
          <p className={`${text.label} mb-0.5`}>Email Address</p>
          <p className={`${text.muted} mb-2`}>
            The email you signed up with. This is used for login and notifications.
          </p>
          <div className={readOnlyField}>{user?.email || "—"}</div>
        </div>

        {/* Theme Section */}
        <div className={`${sectionDivider} animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-175`}>
          <p className={`${text.label} mb-0.5`}>Theme</p>
          <p className={`${text.muted} mb-3`}>
            Controls how the interface looks. System follows your device's setting.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              className={theme === "light" ? selectionCardActive : selectionCardInactive}
            >
              <Sun size={20} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
              <span className={text.description}>Light</span>
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              className={theme === "dark" ? selectionCardActive : selectionCardInactive}
            >
              <Moon size={20} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
              <span className={text.description}>Dark</span>
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("system")}
              className={theme === "system" ? selectionCardActive : selectionCardInactive}
            >
              <div className="flex items-center gap-1.5">
                <Sun size={14} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
                <Moon size={14} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
              </div>
              <span className={text.description}>System</span>
            </button>
          </div>
        </div>

        {/* Logout Section */}
        <div className={`${sectionDivider} animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-200`}>
          <p className={`${text.muted} mb-3`}>Signs you out of this session. Your data and websites are kept safe.</p>
          <button type="button" onClick={handleLogout} className={`${dangerButton} gap-2`} data-testid="logout-button">
            <LogOut size={16} strokeWidth={1.75} />
            Log out
          </button>
        </div>
      </div>
    </SettingsTabLayout>
  )
}
