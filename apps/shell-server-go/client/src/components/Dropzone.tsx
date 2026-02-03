import { useRef, useState } from "react"
import { formatFileSize } from "../lib/format"
import { useUIStore } from "../store/ui"
import { useUploadStore } from "../store/upload"

export function Dropzone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const selectedFile = useUploadStore(s => s.selectedFile)
  const setSelectedFile = useUploadStore(s => s.setSelectedFile)
  const setMessage = useUIStore(s => s.setMessage)
  const clearMessage = useUIStore(s => s.clearMessage)

  function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.name.endsWith(".zip")) {
      setMessage("Please select a ZIP file", "error")
      return
    }
    setSelectedFile(file)
    clearMessage()
  }

  function handleClick() {
    inputRef.current?.click()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer?.files[0])
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0])
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg py-16 md:py-10 px-5 text-center cursor-pointer transition-all bg-shell-bg ${
          dragOver
            ? "border-shell-accent bg-[#252525]"
            : "border-shell-border hover:border-shell-accent hover:bg-[#252525]"
        }`}
      >
        <div className="text-5xl mb-4">📦</div>
        <div className="text-shell-text text-base mb-2">Drag & drop a ZIP file here</div>
        <div className="text-shell-text-muted text-sm">or click to browse</div>
      </div>
      <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={handleInputChange} />
      {selectedFile && (
        <div className="bg-shell-bg p-4 rounded mt-4">
          <div className="text-shell-accent text-sm mb-1">{selectedFile.name}</div>
          <div className="text-shell-text-muted text-xs">{formatFileSize(selectedFile.size)}</div>
        </div>
      )}
    </>
  )
}
