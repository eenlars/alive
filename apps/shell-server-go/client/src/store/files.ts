import { create } from "zustand"
import type { ItemType, SelectedItem, TreeNode } from "../types/domain"

interface FilesState {
  fileTreePath: string
  fileTree: TreeNode[]
  fileTreeLoading: boolean

  previewFilename: string
  previewFilesize: number
  previewContent: string
  previewError: string
  previewLoading: boolean

  selectedItem: SelectedItem

  setFileTreePath: (path: string) => void
  setFileTree: (tree: TreeNode[]) => void
  setFileTreeLoading: (loading: boolean) => void
  setPreview: (filename: string, filesize: number, content: string) => void
  setPreviewError: (error: string) => void
  setPreviewLoading: (loading: boolean) => void
  selectItem: (path: string, type: ItemType) => void
  clearSelectedItem: () => void
  clearPreview: () => void
}

export const useFilesStore = create<FilesState>(set => ({
  fileTreePath: "",
  fileTree: [],
  fileTreeLoading: false,

  previewFilename: "",
  previewFilesize: 0,
  previewContent: "",
  previewError: "",
  previewLoading: false,

  selectedItem: null,

  setFileTreePath: path => set({ fileTreePath: path }),
  setFileTree: tree => set({ fileTree: tree }),
  setFileTreeLoading: loading => set({ fileTreeLoading: loading }),
  setPreview: (filename, filesize, content) =>
    set({ previewFilename: filename, previewFilesize: filesize, previewContent: content, previewError: "" }),
  setPreviewError: error => set({ previewError: error }),
  setPreviewLoading: loading => set({ previewLoading: loading }),
  selectItem: (path, type) => set({ selectedItem: { path, type } }),
  clearSelectedItem: () => set({ selectedItem: null }),
  clearPreview: () => set({ previewFilename: "", previewFilesize: 0, previewContent: "", previewError: "" }),
}))
