import { create, type StateCreator } from "zustand"
import { persist } from "zustand/middleware"
import { useShallow } from "zustand/react/shallow"

export interface DeploymentHistory {
  id: string
  domain: string
  timestamp: number
  success: boolean
  error?: string
}

export type DeploymentStatus = "idle" | "validating" | "deploying" | "validating-ssl" | "success" | "error"

// Form slice (Guide §14.3: group actions in stable object)
interface FormSlice {
  domain: string
  password: string
  formActions: {
    setDomain: (domain: string) => void
    setPassword: (password: string) => void
    resetForm: () => void
  }
}

// Status slice (Guide §14.3: group actions in stable object)
interface StatusSlice {
  isDeploying: boolean
  deploymentStatus: DeploymentStatus
  deploymentDomain: string | null
  deploymentErrors: string[]
  statusActions: {
    setIsDeploying: (isDeploying: boolean) => void
    setDeploymentStatus: (status: DeploymentStatus) => void
    setDeploymentDomain: (domain: string | null) => void
    setDeploymentErrors: (errors: string[]) => void
  }
}

// History slice (Guide §14.3: group actions in stable object)
interface HistorySlice {
  history: DeploymentHistory[]
  historyActions: {
    addToHistory: (entry: DeploymentHistory) => void
    clearHistory: () => void
  }
}

export type DeployStore = FormSlice & StatusSlice & HistorySlice

const createFormSlice: StateCreator<DeployStore, [], [], FormSlice> = (set, _get, _api) => {
  const formActions = {
    setDomain: (domain: string) => set({ domain }),
    setPassword: (password: string) => set({ password }),
    resetForm: () => set({ domain: "", password: "" }),
  }
  return {
    domain: "",
    password: "",
    formActions,
  }
}

const createStatusSlice: StateCreator<DeployStore, [], [], StatusSlice> = (set, _get, _api) => {
  const statusActions = {
    setIsDeploying: (isDeploying: boolean) => set({ isDeploying }),
    setDeploymentStatus: (status: DeploymentStatus) => set({ deploymentStatus: status }),
    setDeploymentDomain: (domain: string | null) => set({ deploymentDomain: domain }),
    setDeploymentErrors: (errors: string[]) => set({ deploymentErrors: errors }),
  }
  return {
    isDeploying: false,
    deploymentStatus: "idle",
    deploymentDomain: null,
    deploymentErrors: [],
    statusActions,
  }
}

const createHistorySlice: StateCreator<DeployStore, [], [], HistorySlice> = (set, _get, _api) => {
  const historyActions = {
    addToHistory: (entry: DeploymentHistory) =>
      set((state: DeployStore) => ({
        history: [entry, ...state.history].slice(0, 50),
      })),
    clearHistory: () => set({ history: [] }),
  }
  return {
    history: [],
    historyActions,
  }
}

/**
 * Deploy Store - Site deployment form and history.
 *
 * skipHydration: true - Prevents automatic hydration on store creation.
 * Hydration is coordinated by HydrationManager to ensure all stores
 * hydrate together, eliminating race conditions in E2E tests.
 */
export const useDeployStore = create<DeployStore>()(
  persist(
    (...a) => {
      const form = createFormSlice(...a) as any
      const status = createStatusSlice(...a) as any
      const history = createHistorySlice(...a) as any

      return {
        ...form,
        ...status,
        ...history,
      } as DeployStore
    },
    {
      name: "deploy-storage",
      version: 1,
      partialize: state => ({
        domain: state.domain,
        history: state.history,
      }),
      migrate: (persistedState: unknown, _version: number) => {
        // Simple pass-through migration - no schema changes needed
        return persistedState as Partial<DeployStore>
      },
      skipHydration: true,
    },
  ),
)

// Atomic selectors (Guide §14.1) - state values
export const useDeployDomain = () => useDeployStore(state => state.domain)
export const useDeployPassword = () => useDeployStore(state => state.password)
export const useDeployIsDeploying = () => useDeployStore(state => state.isDeploying)
export const useDeploymentStatus = () => useDeployStore(state => state.deploymentStatus)
export const useDeploymentDomain = () => useDeployStore(state => state.deploymentDomain)
export const useDeploymentErrors = () => useDeployStore(state => state.deploymentErrors)
export const useDeploymentHistory = () => useDeployStore(state => state.history)

// Actions hooks (Guide §14.3) - stable references
export const useFormActions = () => useDeployStore(state => state.formActions)
export const useStatusActions = () => useDeployStore(state => state.statusActions)
export const useHistoryActions = () => useDeployStore(state => state.historyActions)

// Composite selector: form data with actions (Guide §14.2)
export const useDeployForm = () =>
  useDeployStore(
    useShallow(state => ({
      domain: state.domain,
      password: state.password,
      ...state.formActions,
    })),
  )

// Composite selector: deployment status with actions (Guide §14.2)
export const useDeploymentStatusWithActions = () =>
  useDeployStore(
    useShallow(state => ({
      isDeploying: state.isDeploying,
      status: state.deploymentStatus,
      domain: state.deploymentDomain,
      errors: state.deploymentErrors,
      ...state.statusActions,
    })),
  )
