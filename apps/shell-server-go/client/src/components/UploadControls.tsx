import { useState } from "react"
import { checkDirectory, createDirectory, uploadFile } from "../api/upload"
import { buildErrorMessage } from "../lib/errors"
import { useUIStore } from "../store/ui"
import { useCanCheck, useCanUpload, useUploadStore } from "../store/upload"

export function UploadControls({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const workspace = useUploadStore(s => s.workspace)
  const targetDir = useUploadStore(s => s.targetDir)
  const selectedFile = useUploadStore(s => s.selectedFile)
  const uploading = useUploadStore(s => s.uploading)
  const checking = useUploadStore(s => s.checking)
  const progress = useUploadStore(s => s.progress)

  const setTargetDir = useUploadStore(s => s.setTargetDir)
  const setSelectedFile = useUploadStore(s => s.setSelectedFile)
  const setUploading = useUploadStore(s => s.setUploading)
  const setChecking = useUploadStore(s => s.setChecking)
  const setProgress = useUploadStore(s => s.setProgress)

  const canUpload = useCanUpload()
  const canCheck = useCanCheck()

  const setMessage = useUIStore(s => s.setMessage)
  const clearMessage = useUIStore(s => s.clearMessage)

  const [creating, setCreating] = useState(false)

  async function handleCheck() {
    if (!canCheck) return
    setChecking(true)
    clearMessage()

    try {
      const result = await checkDirectory(workspace, targetDir)
      if (result.error) {
        setMessage(result.error, "error")
      } else {
        setMessage(`${result.message} ${result.exists ? "✓" : "✗"}`, result.exists ? "success" : "error")
      }
    } catch (err) {
      setMessage(`Check failed: ${(err as Error).message}`, "error")
    } finally {
      setChecking(false)
    }
  }

  async function handleCreate() {
    if (!targetDir.trim()) {
      setMessage("Enter a directory name first", "error")
      return
    }
    setCreating(true)
    clearMessage()

    try {
      const result = await createDirectory(workspace, targetDir)
      if (result.error) {
        setMessage(result.error, "error")
      } else if (result.success) {
        setMessage(result.message + (result.created ? " ✓" : " (already exists)"), "success")
      }
    } catch (err) {
      setMessage(`Create failed: ${(err as Error).message}`, "error")
    } finally {
      setCreating(false)
    }
  }

  async function handleUpload() {
    if (!canUpload || !selectedFile) return
    setUploading(true)
    setProgress(0)
    clearMessage()

    try {
      const result = await uploadFile(selectedFile, workspace, targetDir, p => {
        setProgress(p)
      })
      if (result.success) {
        setMessage(result.message || "Upload successful!", "success")
        setTimeout(() => {
          setSelectedFile(null)
          setProgress(0)
          clearMessage()
          onUploadSuccess()
        }, 2000)
      } else {
        setMessage(buildErrorMessage(result), "error")
      }
    } catch (err) {
      setMessage(`Upload failed: ${(err as Error).message}`, "error")
    } finally {
      setUploading(false)
    }
  }

  function handleTargetDirInput(e: React.ChangeEvent<HTMLInputElement>) {
    setTargetDir(e.target.value)
  }

  return (
    <>
      <div className="mb-5">
        <label htmlFor="target-dir" className="block text-shell-text text-sm mb-2 font-medium">
          Subdirectory (optional)
        </label>
        <input
          id="target-dir"
          type="text"
          placeholder="Leave empty for root"
          value={targetDir}
          onInput={handleTargetDirInput}
          className="w-full p-3 border border-shell-border bg-shell-bg text-white rounded text-sm focus:outline-none focus:border-shell-accent"
        />
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={handleCheck}
            disabled={!canCheck}
            className="px-5 py-2.5 bg-shell-blue hover:bg-shell-blue-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white border-none rounded text-sm font-semibold cursor-pointer transition-colors"
          >
            {checking ? "Checking..." : "Check"}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !targetDir.trim()}
            className="px-5 py-2.5 bg-shell-accent hover:bg-shell-accent-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white border-none rounded text-sm font-semibold cursor-pointer transition-colors"
          >
            {creating ? "Creating..." : "Create Directory"}
          </button>
        </div>
      </div>
      {selectedFile && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload}
          className="w-full p-3.5 bg-shell-accent hover:bg-shell-accent-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white border-none rounded text-base font-semibold cursor-pointer mt-5 transition-colors"
        >
          {uploading ? `Uploading ${progress}%` : "Upload & Extract"}
        </button>
      )}
      {uploading && (
        <div className="w-full h-1 bg-shell-border rounded overflow-hidden mt-3">
          <div className="h-full bg-shell-accent transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
    </>
  )
}
