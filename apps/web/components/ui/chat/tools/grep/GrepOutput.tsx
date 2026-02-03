type GrepOutputProps = GrepContentOutputProps | GrepFilesOutputProps | GrepCountOutputProps

interface GrepContentOutputProps {
  matches: Array<{
    file: string
    line_number?: number
    line: string
    before_context?: string[]
    after_context?: string[]
  }>
  total_matches: number
}

interface GrepFilesOutputProps {
  files: string[]
  count: number
}

interface GrepCountOutputProps {
  counts: Array<{
    file: string
    count: number
  }>
  total: number
}

export function GrepOutput(props: GrepOutputProps) {
  // Content output (matching lines)
  if ("matches" in props && "total_matches" in props) {
    return (
      <div className="space-y-1.5">
        <div className="text-xs text-black/40 dark:text-white/40 font-normal">{props.total_matches} matches</div>
        <div className="bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 max-h-60 overflow-auto">
          <div className="space-y-2">
            {props.matches.map((match, index) => (
              <div key={index} className="space-y-0.5">
                <div className="text-[10px] text-black/40 dark:text-white/40 font-diatype-mono">
                  {match.file.split("/").pop()}
                  {match.line_number && `:${match.line_number}`}
                </div>
                {match.before_context?.map((line, i) => (
                  <div
                    key={`before-${i}`}
                    className="text-[11px] text-black/30 dark:text-white/30 font-diatype-mono break-all"
                  >
                    {line}
                  </div>
                ))}
                <div className="text-[11px] text-black/70 dark:text-white/70 font-diatype-mono break-all bg-amber-500/10 dark:bg-amber-400/10 -mx-1 px-1 rounded">
                  {match.line}
                </div>
                {match.after_context?.map((line, i) => (
                  <div
                    key={`after-${i}`}
                    className="text-[11px] text-black/30 dark:text-white/30 font-diatype-mono break-all"
                  >
                    {line}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Files output (just file names)
  if ("files" in props && "count" in props) {
    return (
      <div className="space-y-1.5">
        <div className="text-xs text-black/40 dark:text-white/40 font-normal">{props.count} files</div>
        <div className="bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 max-h-60 overflow-auto">
          <div className="space-y-0.5">
            {props.files.map((file, index) => (
              <div key={index} className="text-[11px] text-black/60 dark:text-white/60 font-diatype-mono break-all">
                {file}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Count output (counts per file)
  if ("counts" in props && "total" in props) {
    return (
      <div className="space-y-1.5">
        <div className="text-xs text-black/40 dark:text-white/40 font-normal">{props.total} total matches</div>
        <div className="bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 max-h-60 overflow-auto">
          <div className="space-y-0.5">
            {props.counts.map((count, index) => (
              <div
                key={index}
                className="text-[11px] text-black/60 dark:text-white/60 font-diatype-mono flex justify-between"
              >
                <span className="break-all">{count.file}</span>
                <span className="text-black/40 dark:text-white/40 shrink-0 ml-2">{count.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return null
}
