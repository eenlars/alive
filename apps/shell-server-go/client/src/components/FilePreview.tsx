import { useEffect, useRef } from "react"
import { downloadFile, readFile } from "../api/files"
import { formatFileSize } from "../lib/format"
import { getLanguageFromFilename } from "../lib/language"
import { useFilesStore } from "../store/files"
import { useUploadStore } from "../store/upload"

declare const hljs: { highlightElement: (el: HTMLElement) => void }

export function FilePreview({ filePath }: { filePath: string }) {
  const codeRef = useRef<HTMLElement>(null)

  const workspace = useUploadStore(s => s.workspace)

  const previewFilename = useFilesStore(s => s.previewFilename)
  const previewFilesize = useFilesStore(s => s.previewFilesize)
  const previewContent = useFilesStore(s => s.previewContent)
  const previewError = useFilesStore(s => s.previewError)
  const previewLoading = useFilesStore(s => s.previewLoading)

  const setPreview = useFilesStore(s => s.setPreview)
  const setPreviewError = useFilesStore(s => s.setPreviewError)
  const setPreviewLoading = useFilesStore(s => s.setPreviewLoading)
  const clearPreview = useFilesStore(s => s.clearPreview)

  async function loadPreview(path: string) {
    if (!path) return
    setPreviewLoading(true)
    setPreviewError("")
    clearPreview()

    try {
      const result = await readFile(workspace, path)
      if (result.error) {
        setPreviewError(result.binary ? `Cannot preview binary file (${result.extension})` : result.error)
        return
      }
      setPreview(result.filename, result.size, result.content)
    } catch (err) {
      setPreviewError((err as Error).message)
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (filePath) loadPreview(filePath)
  }, [filePath])

  useEffect(() => {
    if (codeRef.current && previewContent && typeof hljs !== "undefined") {
      hljs.highlightElement(codeRef.current)
    }
  }, [previewContent])

  const language = getLanguageFromFilename(previewFilename)

  function handleDownload() {
    if (filePath) {
      downloadFile(workspace, filePath)
    }
  }

  return (
    <div className="bg-shell-surface rounded-lg flex flex-col h-full min-h-[400px] max-h-[calc(100vh-200px)]">
      <div className="text-shell-accent p-3 border-b border-shell-border text-sm font-mono flex justify-between items-center gap-3 shrink-0">
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {previewFilename || "No file selected"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {previewFilesize > 0 && (
            <span className="text-shell-text-muted text-xs">{formatFileSize(previewFilesize)}</span>
          )}
          {filePath && (
            <button
              onClick={handleDownload}
              className="text-shell-text-muted hover:text-shell-accent transition-colors p-1"
              title="Download file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-shell-code-bg rounded-b-lg">
        {previewLoading ? (
          <div className="flex items-center justify-center h-full text-shell-text-muted text-sm">Loading...</div>
        ) : previewError ? (
          <div className="flex items-center justify-center h-full text-shell-danger text-sm text-center p-5">
            {previewError}
          </div>
        ) : previewContent ? (
          <pre className="m-0 p-4 font-mono text-sm leading-relaxed overflow-x-auto">
            <code ref={codeRef} className={`language-${language}`}>
              {previewContent}
            </code>
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-shell-text-muted text-sm">
            Select a file to preview
          </div>
        )}
      </div>
    </div>
  )
}
