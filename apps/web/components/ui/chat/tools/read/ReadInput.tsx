interface ReadInputProps {
  file_path: string
  offset?: number
  limit?: number
}

export function ReadInput({ file_path, offset, limit }: ReadInputProps) {
  const fileName = file_path.split("/").pop() || file_path

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="text-black/60 dark:text-white/60 font-diatype-mono">{fileName}</div>
        {(offset || limit) && (
          <div className="text-black/40 dark:text-white/40 font-normal">
            {offset && `from line ${offset}`} {limit && `• ${limit} lines`}
          </div>
        )}
      </div>
      <div className="text-black/50 dark:text-white/50 font-mono text-[10px] break-all">{file_path}</div>
    </div>
  )
}
