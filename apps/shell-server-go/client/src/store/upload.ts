import { create } from "zustand"
import { defaultUploadPath } from "./config"

interface UploadState {
  workspace: string
  uploadPath: string
  targetDir: string
  sites: string[]
  sitesBasePath: string
  selectedFile: File | null
  uploading: boolean
  checking: boolean
  progress: number

  setWorkspace: (workspace: string) => void
  setUploadPath: (path: string) => void
  setTargetDir: (dir: string) => void
  setSites: (sites: string[]) => void
  setSitesBasePath: (path: string) => void
  setSelectedFile: (file: File | null) => void
  setUploading: (uploading: boolean) => void
  setChecking: (checking: boolean) => void
  setProgress: (progress: number) => void
  selectWorkspace: (value: string) => void
}

export const useUploadStore = create<UploadState>((set, get) => ({
  workspace: "root",
  uploadPath: defaultUploadPath,
  targetDir: "",
  sites: [],
  sitesBasePath: "",
  selectedFile: null,
  uploading: false,
  checking: false,
  progress: 0,

  setWorkspace: workspace => set({ workspace }),
  setUploadPath: path => set({ uploadPath: path }),
  setTargetDir: dir => set({ targetDir: dir }),
  setSites: sites => set({ sites }),
  setSitesBasePath: path => set({ sitesBasePath: path }),
  setSelectedFile: file => set({ selectedFile: file }),
  setUploading: uploading => set({ uploading }),
  setChecking: checking => set({ checking }),
  setProgress: progress => set({ progress }),

  selectWorkspace: value => {
    if (value === "root") {
      set({ workspace: "root", uploadPath: defaultUploadPath })
    } else if (value.startsWith("site:")) {
      const siteName = value.slice(5)
      set({
        workspace: value,
        uploadPath: `${get().sitesBasePath}/${siteName}/user`,
      })
    }
  },
}))

// Computed selectors
export const useHasFile = () => useUploadStore(s => s.selectedFile !== null)
export const useCanUpload = () => useUploadStore(s => s.selectedFile !== null && !s.uploading)
export const useCanCheck = () => useUploadStore(s => !s.checking && !s.uploading)
export const useDisplayWorkspace = () =>
  useUploadStore(s => {
    if (s.workspace === "root") return `Root - ${defaultUploadPath}`
    if (s.workspace.startsWith("site:")) return s.workspace.slice(5)
    return s.workspace
  })
