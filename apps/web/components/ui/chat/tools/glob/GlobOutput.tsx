interface GlobOutputProps {
  matches: string[]
  count: number
  search_path: string
}

export function GlobOutput({ matches, count, search_path }: GlobOutputProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-black/40 dark:text-white/40 font-normal">
        {count} {count === 1 ? "file" : "files"} in {search_path}
      </div>
      <div className="bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 max-h-60 overflow-auto">
        <div className="space-y-0.5">
          {matches.map((match, index) => (
            <div key={index} className="text-[11px] text-black/60 dark:text-white/60 font-diatype-mono break-all">
              {match}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
