interface EditOutputProps {
  replacements?: number
  file_path?: string
  error?: string
}

export function EditOutput({ replacements, file_path, error }: EditOutputProps) {
  if (error) {
    return <div className="text-xs text-red-500 dark:text-red-400 font-normal">{error}</div>
  }

  const fileName = file_path?.split("/").pop() || "file"

  return (
    <div className="text-xs text-black/50 dark:text-white/50 font-normal">
      {replacements || 0} {replacements === 1 ? "change" : "changes"} in {fileName}
    </div>
  )
}
