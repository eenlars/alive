interface WriteInputProps {
  file_path: string
  content: string
}

export function WriteInput({ file_path, content }: WriteInputProps) {
  const fileName = file_path.split("/").pop() || file_path
  const lines = content.split("\n").length

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="text-black/60 dark:text-white/60 font-diatype-mono">{fileName}</div>
        <div className="text-black/40 dark:text-white/40 font-normal">
          {lines} {lines === 1 ? "line" : "lines"}
        </div>
      </div>
      <div className="text-black/50 dark:text-white/50 font-mono text-[10px] break-all">{file_path}</div>
      <div>
        <div className="text-black/50 dark:text-white/50 mb-1">Content:</div>
        <div className="bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 text-black/50 dark:text-white/50 font-mono text-[10px] whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {content}
        </div>
      </div>
    </div>
  )
}
