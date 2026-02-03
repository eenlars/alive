interface TaskInputProps {
  description: string
  prompt: string
  subagent_type: string
}

export function TaskInput({ description, prompt, subagent_type }: TaskInputProps) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-black/50 dark:text-white/50 mb-1">Description:</div>
        <div className="text-black/70 dark:text-white/70">{description}</div>
      </div>
      <div>
        <div className="text-black/50 dark:text-white/50 mb-1">Agent:</div>
        <div className="text-black/60 dark:text-white/60 font-diatype-mono">{subagent_type}</div>
      </div>
      {prompt && (
        <div>
          <div className="text-black/50 dark:text-white/50 mb-1">Prompt:</div>
          <div className="text-black/50 dark:text-white/50 bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
            {prompt}
          </div>
        </div>
      )}
    </div>
  )
}
