import { useEffect } from "react"
import { EditorApp } from "../components/editor/EditorApp"
import { useConfigStore } from "../store/config"

export function EditPage() {
  const config = useConfigStore(s => s.config)

  // Set editable directories globally for other components
  useEffect(() => {
    if (config?.editableDirectories) {
      ;(window as any).__EDITABLE_DIRECTORIES__ = config.editableDirectories
    }
  }, [config])

  return <EditorApp />
}
