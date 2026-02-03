interface EditInputProps {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export function EditInput({ file_path, old_string, new_string, replace_all }: EditInputProps) {
  const fileName = file_path.split("/").pop() || file_path
  const oldLines = old_string.split("\n")
  const newLines = new_string.split("\n")

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="text-black/60 dark:text-white/60 font-diatype-mono">{fileName}</div>
        <div className="text-black/40 dark:text-white/40 font-normal">
          {oldLines.length} → {newLines.length} lines
          {replace_all && " • all"}
        </div>
      </div>

      <div className="text-black/40 dark:text-white/40 font-mono text-[10px] break-all">{file_path}</div>

      <div className="bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 max-h-60 overflow-auto">
        <div className="font-diatype-mono text-[11px] leading-relaxed space-y-px">
          {oldLines.map((line, i) => (
            <div key={`old-${i}`} className="flex">
              <span className="text-red-400 dark:text-red-400/70 select-none w-4 shrink-0">−</span>
              <span className="text-red-600/70 dark:text-red-300/50 whitespace-pre-wrap break-all">{line || " "}</span>
            </div>
          ))}
          {newLines.map((line, i) => (
            <div key={`new-${i}`} className="flex">
              <span className="text-green-500 dark:text-green-400/70 select-none w-4 shrink-0">+</span>
              <span className="text-green-700/80 dark:text-green-300/70 whitespace-pre-wrap break-all">
                {line || " "}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
