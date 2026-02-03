import { Bot, CheckCircle, Hand } from "lucide-react"
import type { AgentManagerStatus } from "@/features/chat/lib/message-parser"

interface AgentManagerMessageProps {
  status: AgentManagerStatus
  message: string
}

export function AgentManagerMessage({ status, message }: AgentManagerMessageProps) {
  const config = {
    stop: {
      icon: Hand,
      title: "Agent Manager - Needs Input",
      bgColor: "bg-amber-50/50 dark:bg-amber-950/30",
      borderColor: "border-amber-200 dark:border-amber-800/50",
      iconColor: "text-amber-500 dark:text-amber-400",
      titleColor: "text-amber-900 dark:text-amber-100",
      textColor: "text-amber-700 dark:text-amber-300",
    },
    done: {
      icon: CheckCircle,
      title: "Agent Manager - PR Complete",
      bgColor: "bg-emerald-50/50 dark:bg-emerald-950/30",
      borderColor: "border-emerald-200 dark:border-emerald-800/50",
      iconColor: "text-emerald-500 dark:text-emerald-400",
      titleColor: "text-emerald-900 dark:text-emerald-100",
      textColor: "text-emerald-700 dark:text-emerald-300",
    },
    suggestion: {
      icon: Bot,
      title: "Agent Manager - Suggestion",
      bgColor: "bg-purple-50/50 dark:bg-purple-950/30",
      borderColor: "border-purple-200 dark:border-purple-800/50",
      iconColor: "text-purple-500 dark:text-purple-400",
      titleColor: "text-purple-900 dark:text-purple-100",
      textColor: "text-purple-700 dark:text-purple-300",
    },
  }

  const { icon: Icon, title, bgColor, borderColor, iconColor, titleColor, textColor } = config[status]

  return (
    <div className="py-3 mb-4">
      <div className={`border ${borderColor} ${bgColor} p-4 rounded`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-medium ${titleColor} mb-1`}>{title}</h3>
            <p className={`text-sm ${textColor} leading-relaxed`}>{message}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
