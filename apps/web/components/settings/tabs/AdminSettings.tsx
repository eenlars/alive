"use client"

import { AlertTriangle, CheckCircle, Loader2, Mail, Play, Server, XCircle } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { EmailDraftDemo } from "@/components/ui/chat/tools/email/EmailDraftOutput"
import { Toggle } from "@/components/ui/Toggle"
import { useSuperadmin } from "@/hooks/use-superadmin"
import buildInfo from "@/lib/get-build-info"
import { SettingsTabLayout } from "./SettingsTabLayout"

type DeployAction = "staging" | "production" | "production-skip-e2e" | "status"
type DeployStatus = "idle" | "running" | "success" | "error"

interface DeployState {
  status: DeployStatus
  output: string[]
  action?: DeployAction
}

function useDeployStream() {
  const [state, setState] = useState<DeployState>({ status: "idle", output: [] })
  const abortControllerRef = useRef<AbortController | null>(null)

  const runDeploy = useCallback(async (action: DeployAction) => {
    // Cancel any existing deployment
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    setState({ status: "running", output: [], action })

    try {
      const response = await fetch("/api/admin/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const error = await response.json()
        setState(prev => ({
          ...prev,
          status: "error",
          output: [...prev.output, `Error: ${error.message || "Unknown error"}`],
        }))
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setState(prev => ({ ...prev, status: "error", output: [...prev.output, "No response body"] }))
        return
      }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === "output") {
                setState(prev => ({
                  ...prev,
                  output: [...prev.output, data.text],
                }))
              } else if (data.type === "complete") {
                setState(prev => ({
                  ...prev,
                  status: data.success ? "success" : "error",
                }))
              } else if (data.type === "error") {
                setState(prev => ({
                  ...prev,
                  status: "error",
                  output: [...prev.output, `Error: ${data.message}`],
                }))
              }
            } catch {
              // Ignore parse errors for partial lines
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState(prev => ({
          ...prev,
          status: "error",
          output: [...prev.output, `Error: ${(err as Error).message}`],
        }))
      }
    }
  }, [])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setState(prev => ({ ...prev, status: "idle" }))
    }
  }, [])

  const clear = useCallback(() => {
    setState({ status: "idle", output: [] })
  }, [])

  return { state, runDeploy, cancel, clear }
}

function DeployButton({
  action,
  label,
  variant = "default",
  disabled,
  onClick,
}: {
  action: DeployAction
  label: string
  variant?: "default" | "danger"
  disabled: boolean
  onClick: (action: DeployAction) => void
}) {
  const baseStyles =
    "px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
  const variantStyles =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80"

  return (
    <button
      type="button"
      className={`${baseStyles} ${variantStyles}`}
      disabled={disabled}
      onClick={() => onClick(action)}
    >
      <Play size={14} />
      {label}
    </button>
  )
}

function DeployOutput({ state, onClear }: { state: DeployState; onClear: () => void }) {
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [state.output])

  if (state.status === "idle" && state.output.length === 0) {
    return null
  }

  const statusIcon = {
    idle: null,
    running: <Loader2 size={16} className="animate-spin text-blue-500" />,
    success: <CheckCircle size={16} className="text-green-500" />,
    error: <XCircle size={16} className="text-red-500" />,
  }[state.status]

  const actionLabels: Record<DeployAction, string> = {
    staging: "Staging Deploy",
    production: "Production Deploy",
    "production-skip-e2e": "Production Deploy (Skip E2E)",
    status: "Status Check",
  }

  return (
    <div className="mt-4 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-xs font-medium text-black/60 dark:text-white/60">
            {state.action ? actionLabels[state.action] : "Output"}
          </span>
        </div>
        {state.status !== "running" && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div ref={outputRef} className="max-h-64 overflow-y-auto p-3 bg-black/[0.02] dark:bg-white/[0.02]">
        <pre className="text-xs font-mono text-black/80 dark:text-white/80 whitespace-pre-wrap break-all">
          {state.output.join("") || "Waiting for output..."}
        </pre>
      </div>
    </div>
  )
}

export function AdminSettings() {
  const { state, runDeploy, clear } = useDeployStream()
  const [skipE2E, setSkipE2E] = useState(false)
  const [showEmailDemo, setShowEmailDemo] = useState(false)
  const isSuperadmin = useSuperadmin()

  const isRunning = state.status === "running"

  const handleProductionDeploy = () => {
    runDeploy(skipE2E ? "production-skip-e2e" : "production")
  }

  return (
    <SettingsTabLayout title="Admin" description="System information and admin tools">
      <div className="space-y-6">
        {/* Email Draft Demo - Superadmin only */}
        {isSuperadmin && (
          <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Email Draft Preview</h3>
                <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded-full">
                  SUPERADMIN
                </span>
              </div>
              <Toggle checked={showEmailDemo} onChange={setShowEmailDemo} aria-label="Show email demo" />
            </div>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mb-3">
              Preview the email draft UI component. Claude can draft emails, but only users can click Send.
            </p>
            {showEmailDemo && <EmailDraftDemo />}
          </div>
        )}

        {/* Build info */}
        <div className="p-4 rounded-lg border border-black/10 dark:border-white/10">
          <h3 className="text-sm font-medium text-black dark:text-white mb-2">Build Information</h3>
          <div className="space-y-1">
            <p className="text-xs text-black/60 dark:text-white/60">
              <span className="text-black/40 dark:text-white/40">Date:</span>{" "}
              <span className="font-mono">{buildInfo.buildTime}</span>
            </p>
            <p className="text-xs text-black/60 dark:text-white/60">
              <span className="text-black/40 dark:text-white/40">Branch:</span>{" "}
              <span className="font-mono">{buildInfo.branch}</span>
            </p>
          </div>
        </div>

        {/* Deployment Controls */}
        <div className="p-4 rounded-lg border border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Server size={16} className="text-black/60 dark:text-white/60" />
            <h3 className="text-sm font-medium text-black dark:text-white">Deployment</h3>
          </div>

          {/* Staging */}
          <div className="space-y-4">
            <div>
              <p className="text-xs text-black/60 dark:text-white/60 mb-2">
                Deploy to staging environment (port 8998). Runs build, tests, and restarts.
              </p>
              <DeployButton action="staging" label="Deploy Staging" disabled={isRunning} onClick={runDeploy} />
            </div>

            {/* Production */}
            <div className="pt-4 border-t border-black/10 dark:border-white/10">
              <p className="text-xs text-black/60 dark:text-white/60 mb-3">
                Deploy to production. Requires careful consideration.
              </p>

              {/* E2E Toggle */}
              <div className="flex items-center justify-between mb-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">Skip E2E tests</span>
                </div>
                <Toggle checked={skipE2E} onChange={setSkipE2E} aria-label="Skip E2E tests" />
              </div>

              <DeployButton
                action={skipE2E ? "production-skip-e2e" : "production"}
                label={skipE2E ? "Deploy Production (No E2E)" : "Deploy Production"}
                variant="danger"
                disabled={isRunning}
                onClick={handleProductionDeploy}
              />
            </div>

            {/* Status */}
            <div className="pt-4 border-t border-black/10 dark:border-white/10">
              <p className="text-xs text-black/60 dark:text-white/60 mb-2">Check status of all environments.</p>
              <DeployButton action="status" label="Check Status" disabled={isRunning} onClick={runDeploy} />
            </div>
          </div>

          {/* Output */}
          <DeployOutput state={state} onClear={clear} />
        </div>
      </div>
    </SettingsTabLayout>
  )
}
