/**
 * Plan Approval Output
 *
 * Renders the ExitPlanMode tool result when Claude's plan is ready for approval.
 * Shows the plan file path and an "Approve Plan" button.
 * When approved, disables plan mode and sends a confirmation message to Claude.
 */

"use client"

import { CheckCircle, FileText } from "lucide-react"
import { useCallback, useState } from "react"
import { usePlanModeActions } from "@/lib/stores/planModeStore"
import type { ToolResultRendererProps } from "@/lib/tools/tool-registry"

/**
 * Expected data format from the ExitPlanMode tool
 * When blocked by canUseTool, we receive the denial message
 */
interface PlanApprovalData {
  /** Whether this is a blocked tool result */
  blocked?: boolean
  /** The plan file path if provided */
  planFile?: string
  /** Whether to launch a swarm */
  launchSwarm?: boolean
  /** Number of teammates for swarm */
  teammateCount?: number
}

/**
 * Type guard to validate this is a plan approval request
 * Returns true if the tool result content indicates ExitPlanMode was blocked
 */
export function validatePlanApproval(data: unknown): data is PlanApprovalData {
  // The data might be the denial message string or a parsed object
  if (typeof data === "string") {
    return data.includes("cannot approve your own plan") || data.includes("Approve Plan")
  }
  return true // Accept any object for ExitPlanMode results
}

interface PlanApprovalOutputProps extends ToolResultRendererProps<PlanApprovalData | string> {
  onSubmitAnswer?: (message: string) => void
}

export function PlanApprovalOutput({ data: _data, onSubmitAnswer }: PlanApprovalOutputProps) {
  const [approved, setApproved] = useState(false)
  const { disablePlanMode } = usePlanModeActions()

  const handleApprove = useCallback(() => {
    setApproved(true)
    // Disable plan mode so Claude can now use modification tools
    disablePlanMode()
    // Send confirmation to Claude
    onSubmitAnswer?.("I approve this plan. Please proceed with the implementation.")
  }, [disablePlanMode, onSubmitAnswer])

  const handleReject = useCallback(() => {
    setApproved(true)
    // Keep plan mode on, but let Claude know to revise
    onSubmitAnswer?.("I'd like you to revise this plan. Please consider alternatives or ask me clarifying questions.")
  }, [onSubmitAnswer])

  // Show completion state
  if (approved) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
        <div className="flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Plan approved - continuing with implementation
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30">
      <div className="flex items-start gap-3">
        <FileText className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Plan Ready for Review</h3>
          <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-300/80">
            Claude has created a plan and is waiting for your approval before proceeding with the implementation.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              Approve Plan
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium border border-gray-300 dark:border-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              Request Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
