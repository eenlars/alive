"use client"

import { motion } from "framer-motion"
import { CheckCircle2, ExternalLink } from "lucide-react"
import { useEffect, useState } from "react"

interface AuthenticatedWorkspacesProps {
  currentWorkspace?: string
}

export function AuthenticatedWorkspaces({ currentWorkspace }: AuthenticatedWorkspacesProps) {
  const [workspaces, setWorkspaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auth/workspaces", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.workspaces) {
          setWorkspaces(data.workspaces)
        }
      })
      .catch(err => {
        console.error("Failed to fetch authenticated workspaces:", err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return null
  }

  const otherWorkspaces = currentWorkspace ? workspaces.filter(w => w !== currentWorkspace) : workspaces

  if (otherWorkspaces.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full max-w-md mb-8"
    >
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
        <p className="text-sm font-normal text-black/60 dark:text-white/60">You also have access to:</p>
      </div>

      <div className="space-y-2">
        {otherWorkspaces.map(workspace => (
          <motion.a
            key={workspace}
            href={`https://${workspace}`}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="block p-3 border border-black/10 dark:border-white/10 rounded-lg hover:border-black/20 dark:hover:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between">
              <span className="font-normal text-black/80 dark:text-white/80 group-hover:text-black dark:group-hover:text-white">
                {workspace}
              </span>
              <ExternalLink className="h-4 w-4 text-black/40 dark:text-white/40 group-hover:text-black/60 dark:group-hover:text-white/60" />
            </div>
          </motion.a>
        ))}
      </div>
    </motion.div>
  )
}
