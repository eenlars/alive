import { create } from "zustand"

export interface AppConfig {
  shellDefaultPath: string
  uploadPath: string
  sitesPath: string
  workspaceBase: string
  allowWorkspaceSelection: boolean
  editableDirectories: { id: string; label: string }[]
}

interface ConfigState {
  config: AppConfig | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
  fetchConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set, _get) => ({
  config: null,
  isLoading: true,
  error: null,
  isAuthenticated: false,

  fetchConfig: async () => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch("/api/config")
      if (res.status === 401) {
        set({ isAuthenticated: false, isLoading: false })
        return
      }
      if (!res.ok) {
        throw new Error("Failed to fetch config")
      }
      const data = await res.json()
      set({ config: data, isAuthenticated: true, isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },
}))

export function useConfig() {
  return useConfigStore(s => s.config)
}

export function useIsAuthenticated() {
  return useConfigStore(s => s.isAuthenticated)
}

// Legacy compatibility - get upload path from config or window global
export function getUploadPath(): string {
  const config = useConfigStore.getState().config
  if (config?.uploadPath) return config.uploadPath

  // Fallback to window global (set by UploadPage)
  if (typeof window !== "undefined" && (window as any).__UPLOAD_PATH__) {
    return (window as any).__UPLOAD_PATH__
  }

  return "/root/uploads"
}

// Legacy export for backwards compatibility
export const defaultUploadPath = "/root/uploads"
