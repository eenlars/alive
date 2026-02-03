import { useEffect } from "react"
import { useEditorStore, useIsModified } from "../../store/editor"

// Directories are passed from the server via a global
declare const __EDITABLE_DIRECTORIES__: Array<{ id: string; label: string }>

export function DirectorySelector() {
  const directories = typeof __EDITABLE_DIRECTORIES__ !== "undefined" ? __EDITABLE_DIRECTORIES__ : []
  const currentDirectory = useEditorStore(s => s.currentDirectory)
  const setDirectory = useEditorStore(s => s.setDirectory)
  const isModified = useIsModified()

  // Auto-select first directory (workflows) on mount
  useEffect(() => {
    if (directories.length > 0 && !currentDirectory) {
      setDirectory(directories[0].id)
    }
  }, [directories, currentDirectory, setDirectory])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    if (isModified) {
      if (!confirm("You have unsaved changes. Discard them?")) {
        e.target.value = currentDirectory
        return
      }
    }
    setDirectory(value)
  }

  return (
    <div className="mb-3">
      <label htmlFor="directory-select" className="text-shell-accent text-sm font-semibold block mb-2">
        Directory
      </label>
      <select
        id="directory-select"
        value={currentDirectory}
        onChange={handleChange}
        className="w-full bg-shell-bg text-shell-text border border-shell-border rounded px-3 py-2 text-sm focus:outline-none focus:border-shell-accent"
      >
        <option value="">Select a directory...</option>
        {directories.map(dir => (
          <option key={dir.id} value={dir.id}>
            {dir.label}
          </option>
        ))}
      </select>
    </div>
  )
}
