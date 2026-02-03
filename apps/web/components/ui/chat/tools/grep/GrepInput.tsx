interface GrepInputProps {
  pattern: string
  path?: string
  glob?: string
  type?: string
  output_mode?: "content" | "files_with_matches" | "count"
  "-i"?: boolean
  "-n"?: boolean
  "-A"?: number
  "-B"?: number
  "-C"?: number
  multiline?: boolean
  head_limit?: number
}

export function GrepInput({
  pattern,
  path,
  glob,
  type,
  output_mode = "files_with_matches",
  ...options
}: GrepInputProps) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-black/50 dark:text-white/50 mb-1">Pattern:</div>
        <div className="text-black/60 dark:text-white/60 font-diatype-mono bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2">
          {pattern}
        </div>
      </div>
      {path && (
        <div>
          <div className="text-black/50 dark:text-white/50 mb-1">Path:</div>
          <div className="text-black/60 dark:text-white/60 font-mono text-[10px] break-all">{path}</div>
        </div>
      )}
      <div className="text-black/40 dark:text-white/40 font-normal flex flex-wrap gap-x-2 gap-y-1">
        {glob && <span>in {glob}</span>}
        {type && <span>• {type} files</span>}
        {output_mode !== "files_with_matches" && <span>• {output_mode}</span>}
        {options["-i"] && <span>• case insensitive</span>}
        {options["-n"] && <span>• line numbers</span>}
        {(options["-A"] || options["-B"] || options["-C"]) && <span>• context</span>}
        {options.multiline && <span>• multiline</span>}
        {options.head_limit && <span>• limit {options.head_limit}</span>}
      </div>
    </div>
  )
}
