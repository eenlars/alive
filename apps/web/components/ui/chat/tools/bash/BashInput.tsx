interface BashInputProps {
  command: string
  description?: string
  timeout?: number
  run_in_background?: boolean
}

export function BashInput({ command, description, timeout, run_in_background }: BashInputProps) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-black/50 dark:text-white/50 mb-1">Command:</div>
        <div className="text-black/60 dark:text-white/60 font-diatype-mono bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 whitespace-pre-wrap break-words">
          {command}
        </div>
      </div>
      {description && (
        <div>
          <div className="text-black/50 dark:text-white/50 mb-1">Description:</div>
          <div className="text-black/60 dark:text-white/60">{description}</div>
        </div>
      )}
      {(timeout || run_in_background) && (
        <div className="text-black/40 dark:text-white/40 font-normal flex gap-2">
          {run_in_background && <span>• background</span>}
          {timeout && <span>• timeout: {timeout}ms</span>}
        </div>
      )}
    </div>
  )
}
