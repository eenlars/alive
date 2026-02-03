interface WriteOutputProps {
  bytes_written?: number
  file_path?: string
  error?: string
}

export function WriteOutput({ bytes_written, file_path, error }: WriteOutputProps) {
  if (error) {
    return <div className="text-xs text-red-500 dark:text-red-400 font-normal">{error}</div>
  }

  const fileName = file_path?.split("/").pop() || "file"
  const size = bytes_written || 0
  const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`

  return (
    <div className="text-xs text-black/50 dark:text-white/50 font-normal">
      wrote {sizeStr} to {fileName}
    </div>
  )
}
