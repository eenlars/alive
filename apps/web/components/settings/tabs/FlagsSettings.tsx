"use client"

import { FEATURE_FLAGS, type FeatureFlagKey } from "@webalive/shared"
import { RotateCcw } from "lucide-react"
import { Toggle } from "@/components/ui/Toggle"
import {
  getFeatureFlagKeys,
  useFeatureFlag,
  useFeatureFlagActions,
  useFeatureFlagOverrides,
  useHasOverride,
} from "@/lib/stores/featureFlagStore"
import { SettingsTabLayout } from "./SettingsTabLayout"

function FeatureFlagToggle({ flagKey }: { flagKey: FeatureFlagKey }) {
  const value = useFeatureFlag(flagKey)
  const hasOverride = useHasOverride(flagKey)
  const { setOverride } = useFeatureFlagActions()
  const flagDef = FEATURE_FLAGS[flagKey]

  const handleToggle = (newValue: boolean) => {
    setOverride(flagKey, newValue)
  }

  const handleReset = () => {
    setOverride(flagKey, null)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 rounded-lg border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-medium text-black dark:text-white font-mono break-all">{flagKey}</span>
          {hasOverride && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
              overridden
            </span>
          )}
        </div>
        <p className="text-xs text-black/60 dark:text-white/60">{flagDef.description}</p>
        <p className="text-xs text-black/40 dark:text-white/40 mt-1">
          Default: <span className="font-mono">{flagDef.defaultValue ? "true" : "false"}</span>
        </p>
      </div>
      <div className="flex items-center gap-3 sm:gap-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5 ml-auto">
        {hasOverride && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 sm:p-1.5 text-sm sm:text-xs text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-lg sm:rounded transition-colors"
            title="Reset to default"
          >
            <RotateCcw size={16} className="sm:w-3.5 sm:h-3.5" />
            <span className="sm:hidden">Reset</span>
          </button>
        )}
        <Toggle checked={value} onChange={handleToggle} aria-label={`Toggle ${flagKey}`} />
      </div>
    </div>
  )
}

export function FlagsSettings() {
  const { clearAllOverrides } = useFeatureFlagActions()
  const overrides = useFeatureFlagOverrides()
  const hasAnyOverrides = Object.keys(overrides).length > 0
  const flagKeys = getFeatureFlagKeys()

  return (
    <SettingsTabLayout
      title="Feature Flags"
      description="Turn experimental features on or off. Changes are saved in your browser and only affect you."
    >
      <div className="space-y-4">
        {/* Clear all button */}
        {hasAnyOverrides && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearAllOverrides}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              Reset all to defaults
            </button>
          </div>
        )}

        {/* Flag toggles */}
        <div className="space-y-3">
          {flagKeys.map(flagKey => (
            <FeatureFlagToggle key={flagKey} flagKey={flagKey} />
          ))}
        </div>

        {/* Info box */}
        <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            <strong>Admin only:</strong> These settings are stored in your browser and only affect your account. Changes
            take effect immediately.
          </p>
        </div>
      </div>
    </SettingsTabLayout>
  )
}
