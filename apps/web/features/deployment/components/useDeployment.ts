import { useCallback } from "react"
import toast from "react-hot-toast"
import type { DeployResponse } from "@/features/deployment/types/deploy-subdomain"
import {
  useDeployIsDeploying,
  useDeploymentDomain,
  useDeploymentErrors,
  useDeploymentStatus,
  useFormActions,
  useHistoryActions,
  useStatusActions,
} from "@/lib/stores/deployStore"

export function useDeployment() {
  const isDeploying = useDeployIsDeploying()
  const deploymentStatus = useDeploymentStatus()
  const deploymentDomain = useDeploymentDomain()
  const deploymentErrors = useDeploymentErrors()
  const { resetForm } = useFormActions()
  const { setIsDeploying, setDeploymentStatus, setDeploymentDomain, setDeploymentErrors } = useStatusActions()
  const { addToHistory } = useHistoryActions()

  const deploy = useCallback(
    async (domain: string, password: string): Promise<void> => {
      setIsDeploying(true)
      setDeploymentStatus("validating")
      setDeploymentErrors([])

      try {
        setDeploymentStatus("deploying")
        const response = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, password }),
        })

        const responseText = await response.text()
        const contentType = response.headers.get("content-type")

        if (!contentType?.includes("application/json")) {
          throw new Error(`Server error: ${responseText.substring(0, 200)}`)
        }

        let result: DeployResponse
        try {
          result = JSON.parse(responseText)
        } catch {
          throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`)
        }

        if (result.success) {
          setDeploymentStatus("success")
          setDeploymentDomain(result.domain || domain)
          toast.success(`${domain} deployed successfully!`)
          addToHistory({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            domain,
            timestamp: Date.now(),
            success: true,
          })
          resetForm()
        } else {
          setDeploymentStatus("error")
          const errors = result.errors?.length ? result.errors : [result.message]
          setDeploymentErrors(errors)
          toast.error(result.message)
          addToHistory({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            domain,
            timestamp: Date.now(),
            success: false,
            error: result.message,
          })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Deployment failed"
        setDeploymentStatus("error")
        setDeploymentErrors([errorMessage])
        toast.error(errorMessage)
        addToHistory({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          domain,
          timestamp: Date.now(),
          success: false,
          error: errorMessage,
        })
      } finally {
        setIsDeploying(false)
      }
    },
    [setIsDeploying, setDeploymentStatus, setDeploymentDomain, setDeploymentErrors, addToHistory, resetForm],
  )

  return {
    deploy,
    isDeploying,
    deploymentStatus,
    deploymentDomain,
    deploymentErrors,
  }
}
