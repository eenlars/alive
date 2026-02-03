/**
 * User Environment Keys Settings Component
 *
 * Allows users to manage custom environment keys stored in the lockbox.
 * These keys are available to MCP servers for custom API integrations.
 */

"use client"

import { AlertCircle, CheckCircle2, Eye, EyeOff, Key, Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"

interface EnvKey {
  name: string
  hasValue: boolean
}

interface UseUserEnvKeysResult {
  keys: EnvKey[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch user env keys
 */
function useUserEnvKeys(): UseUserEnvKeysResult {
  const [keys, setKeys] = useState<EnvKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchKeys = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/user-env-keys", {
        credentials: "include",
      })

      const data = await response.json()

      if (data.ok) {
        setKeys(data.keys || [])
      } else {
        setError(data.message || "Failed to load keys")
      }
    } catch (err) {
      setError("Failed to load environment keys")
      console.error("[UserEnvKeys] Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKeys()
  }, [])

  return { keys, loading, error, refetch: fetchKeys }
}

interface AddKeyFormProps {
  onAdd: (keyName: string, keyValue: string) => Promise<void>
  disabled?: boolean
}

/**
 * Form for adding a new environment key
 */
function AddKeyForm({ onAdd, disabled }: AddKeyFormProps) {
  const [keyName, setKeyName] = useState("")
  const [keyValue, setKeyValue] = useState("")
  const [showValue, setShowValue] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateKeyName = (name: string): string | null => {
    if (!name) return "Key name is required"
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      return "Must be uppercase, start with a letter (e.g., MY_API_KEY)"
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationError = validateKeyName(keyName)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!keyValue) {
      setError("Key value is required")
      return
    }

    try {
      setSaving(true)
      setError(null)
      await onAdd(keyName, keyValue)
      setKeyName("")
      setKeyValue("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save key")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Key Name Input */}
        <div>
          <label htmlFor="env-key-name" className="block text-xs font-medium text-black/70 dark:text-white/70 mb-1">
            Key Name
          </label>
          <input
            id="env-key-name"
            type="text"
            value={keyName}
            onChange={e => {
              setKeyName(e.target.value.toUpperCase())
              setError(null)
            }}
            placeholder="MY_API_KEY"
            disabled={disabled || saving}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-black/20 dark:border-white/20 rounded-lg text-sm text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:border-black dark:focus:border-white transition-colors disabled:opacity-50 font-mono"
          />
        </div>

        {/* Key Value Input */}
        <div>
          <label htmlFor="env-key-value" className="block text-xs font-medium text-black/70 dark:text-white/70 mb-1">
            Value
          </label>
          <div className="relative">
            <input
              id="env-key-value"
              type={showValue ? "text" : "password"}
              value={keyValue}
              onChange={e => {
                setKeyValue(e.target.value)
                setError(null)
              }}
              placeholder="sk-..."
              disabled={disabled || saving}
              className="w-full px-3 py-2 pr-10 bg-white dark:bg-zinc-800 border border-black/20 dark:border-white/20 rounded-lg text-sm text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:border-black dark:focus:border-white transition-colors disabled:opacity-50 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
              tabIndex={-1}
            >
              {showValue ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={disabled || saving || !keyName || !keyValue}
        className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-80 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Plus size={16} />
            Add Key
          </>
        )}
      </button>
    </form>
  )
}

interface EnvKeyRowProps {
  envKey: EnvKey
  onDelete: (keyName: string) => Promise<void>
}

/**
 * Single row for an environment key
 */
function EnvKeyRow({ envKey, onDelete }: EnvKeyRowProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    try {
      setDeleting(true)
      await onDelete(envKey.name)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded">
          <Key size={14} className="text-green-600 dark:text-green-400" />
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium font-mono text-black dark:text-white truncate block">{envKey.name}</span>
          <span className="text-xs text-black/50 dark:text-white/50">Encrypted and stored securely</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="flex-shrink-0 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
        title="Delete key"
      >
        {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
      </button>
    </div>
  )
}

/**
 * Main component for managing user environment keys
 */
export function UserEnvKeysSettings() {
  const { keys, loading, error, refetch } = useUserEnvKeys()

  const handleAddKey = async (keyName: string, keyValue: string) => {
    const response = await fetch("/api/user-env-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ keyName, keyValue }),
    })

    const data = await response.json()

    if (!data.ok) {
      throw new Error(data.message || "Failed to save key")
    }

    toast.success(`${keyName} saved`, {
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    })
    await refetch()
  }

  const handleDeleteKey = async (keyName: string) => {
    const response = await fetch("/api/user-env-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ keyName }),
    })

    const data = await response.json()

    if (!data.ok) {
      toast.error(data.message || "Failed to delete key")
      return
    }

    toast.success(`${keyName} deleted`)
    await refetch()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-black/40 dark:text-white/40" />
        <span className="ml-2 text-sm text-black/60 dark:text-white/60">Loading keys...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        <button
          type="button"
          onClick={refetch}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Add New Key Form */}
      <div className="p-4 bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/10 dark:border-white/10">
        <h4 className="text-sm font-medium text-black dark:text-white mb-3">Add Environment Key</h4>
        <AddKeyForm onAdd={handleAddKey} />
      </div>

      {/* Existing Keys List */}
      <div>
        <h4 className="text-sm font-medium text-black dark:text-white mb-3">
          Your Keys {keys.length > 0 && <span className="text-black/50 dark:text-white/50">({keys.length})</span>}
        </h4>

        {keys.length === 0 ? (
          <div className="text-center py-8 text-black/40 dark:text-white/40 text-sm border border-dashed border-black/20 dark:border-white/20 rounded-lg">
            No environment keys yet. Add one above.
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map(key => (
              <EnvKeyRow key={key.name} envKey={key} onDelete={handleDeleteKey} />
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800/50">
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          <strong>Secure storage:</strong> Your keys are encrypted with AES-256-GCM before storage. They can be used by
          MCP integrations (like custom AI services) to authenticate on your behalf.
        </p>
      </div>
    </div>
  )
}
