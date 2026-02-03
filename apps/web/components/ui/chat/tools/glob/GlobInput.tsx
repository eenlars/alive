interface GlobInputProps {
  pattern: string
  path?: string
}

export function GlobInput({ pattern, path }: GlobInputProps) {
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
    </div>
  )
}
