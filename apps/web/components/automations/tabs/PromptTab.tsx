interface PromptTabProps {
  prompt: string
  onPromptChange: (v: string) => void
}

export function PromptTab({ prompt, onPromptChange }: PromptTabProps) {
  return (
    <div className="space-y-1.5 h-full flex flex-col">
      <label htmlFor="auto-prompt" className="text-xs font-medium text-black dark:text-white shrink-0">
        Prompt
      </label>
      <textarea
        id="auto-prompt"
        value={prompt}
        onChange={e => onPromptChange(e.target.value)}
        placeholder="Describe what the agent should do. You can write detailed instructions here — this is the main input the agent receives when it runs."
        className="flex-1 min-h-[200px] w-full px-3 py-2.5 rounded-lg text-sm leading-relaxed bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
        maxLength={10000}
      />
      <div className="text-[11px] text-black/30 dark:text-white/30 text-right shrink-0">
        {prompt.length.toLocaleString()} / 10,000
      </div>
    </div>
  )
}
