"use client"

import { motion } from "framer-motion"
import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useDeploymentHistory, useHistoryActions } from "@/lib/stores/deployStore"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
  },
}

export function DeploymentHistory() {
  const [isClient, setIsClient] = useState(false)
  const history = useDeploymentHistory()
  const { clearHistory } = useHistoryActions()

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return null
  }

  if (history.length === 0) {
    return null
  }

  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="mt-8 w-full max-w-md mx-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Deployments</h3>
        {history.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => clearHistory()}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </motion.button>
        )}
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-2">
        {history.map(entry => (
          <motion.div
            key={entry.id}
            variants={itemVariants}
            className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                {entry.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{entry.domain}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatTime(entry.timestamp)}</p>
                {!entry.success && entry.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-1">{entry.error}</p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
