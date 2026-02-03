import { BashInput } from "@/components/ui/chat/tools/bash/BashInput"
import { EditInput } from "@/components/ui/chat/tools/edit/EditInput"
import { GlobInput } from "@/components/ui/chat/tools/glob/GlobInput"
import { GrepInput } from "@/components/ui/chat/tools/grep/GrepInput"
import { ReadInput } from "@/components/ui/chat/tools/read/ReadInput"
import { TaskInput } from "@/components/ui/chat/tools/task/TaskInput"
import { WebFetchInput } from "@/components/ui/chat/tools/webfetch/WebFetchInput"
import { WriteInput } from "@/components/ui/chat/tools/write/WriteInput"

interface ToolInputRouterProps {
  toolName: string
  // Tool input is dynamic JSON from SDK - SDK defines types (BashInput, etc.) in .d.ts but doesn't export a union
  // Runtime structural validation ensures type safety
  input: any
}

export function ToolInputRouter({ toolName, input }: ToolInputRouterProps) {
  const tool = toolName.toLowerCase()

  switch (tool) {
    case "bash":
      if (input.command) {
        return <BashInput {...input} />
      }
      break

    case "read":
      if (input.file_path) {
        return <ReadInput {...input} />
      }
      break

    case "edit":
      if (input.file_path && input.old_string && input.new_string) {
        return <EditInput {...input} />
      }
      break

    case "write":
      if (input.file_path && input.content) {
        return <WriteInput {...input} />
      }
      break

    case "grep":
      if (input.pattern) {
        return <GrepInput {...input} />
      }
      break

    case "glob":
      if (input.pattern) {
        return <GlobInput {...input} />
      }
      break

    case "task":
      if (input.description && input.prompt && input.subagent_type) {
        return <TaskInput {...input} />
      }
      break

    case "webfetch":
      if (input.url && input.prompt) {
        return <WebFetchInput {...input} />
      }
      break

    // Add other tools as needed
    default:
      // Fallback to JSON for unknown tools
      return (
        <pre className="text-xs text-black/50 dark:text-white/50 font-diatype-mono leading-relaxed overflow-auto max-h-60 p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04]">
          {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
        </pre>
      )
  }

  // Fallback if tool is recognized but input doesn't match expected schema
  return (
    <pre className="text-xs text-black/50 dark:text-white/50 font-diatype-mono leading-relaxed overflow-auto max-h-60 p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04]">
      {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
    </pre>
  )
}
