import { Check, HelpCircle, Target } from "lucide-react"

interface StructuredPromptData {
  boxesToTick?: string
  questionsToAnswer?: string
  proofStrategy?: string
}

interface StructuredPromptProps {
  data: StructuredPromptData
}

export function StructuredPrompt({ data }: StructuredPromptProps) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20 overflow-hidden">
      <div className="p-4 space-y-4">
        {/* Boxes to Tick */}
        {data.boxesToTick && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-semibold text-black dark:text-white">Boxes to Tick</h3>
              <span className="text-xs text-black/40 dark:text-white/40">(max 8)</span>
            </div>
            <p className="text-sm text-black/80 dark:text-white/80 ml-6">{data.boxesToTick}</p>
          </div>
        )}

        {/* Questions to Answer */}
        {data.questionsToAnswer && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-semibold text-black dark:text-white">Questions to Answer</h3>
              <span className="text-xs text-black/40 dark:text-white/40">(max 8)</span>
            </div>
            <p className="text-sm text-black/80 dark:text-white/80 ml-6">{data.questionsToAnswer}</p>
          </div>
        )}

        {/* Proof Strategy */}
        {data.proofStrategy && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-green-600 dark:text-green-400" />
              <h3 className="text-sm font-semibold text-black dark:text-white">Proof Strategy</h3>
            </div>
            <p className="text-sm text-black/80 dark:text-white/80 ml-6">{data.proofStrategy}</p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/5 dark:border-white/5">
        <p className="text-xs text-black/50 dark:text-white/50">
          Structured prompt template • Use this to get detailed proof of how I'll fix your request
        </p>
      </div>
    </div>
  )
}
