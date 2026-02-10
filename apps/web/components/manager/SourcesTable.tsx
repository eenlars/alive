"use client"

import React, { useState } from "react"
import toast from "react-hot-toast"
import type { PortConsistency, SourceData } from "@/types/sources"

interface SourcesTableProps {
  sources: SourceData[]
  loading: boolean
  onDelete?: (domain: string) => void
}

export function SourcesTable({ sources, loading, onDelete }: SourcesTableProps) {
  const [restarting, setRestarting] = useState<string | null>(null)

  const handleRestart = async (domain: string) => {
    setRestarting(domain)
    try {
      const response = await fetch("/api/manager/restart-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      })

      const data = await response.json()

      if (response.ok && data.ok) {
        toast.success(`Service restarted: ${domain}`)
      } else {
        toast.error(data.message || data.error || "Failed to restart service")
      }
    } catch (error) {
      console.error("Failed to restart service:", error)
      toast.error("Failed to restart service")
    } finally {
      setRestarting(null)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 px-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading source data...</p>
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">No domains found</p>
      </div>
    )
  }

  const getPortConsistency = (domain: SourceData): PortConsistency => {
    const ports = [domain.supabase.port, domain.caddy.port].filter(p => p !== null)
    if (ports.length === 0) return { status: "none", color: "text-slate-400 dark:text-slate-500" }
    const allSame = ports.every(p => p === ports[0])
    return {
      status: allSame ? "match" : "mismatch",
      color: allSame ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
    }
  }

  // Mobile Card View
  const MobileCard = ({ domain }: { domain: SourceData }) => {
    const portCheck = getPortConsistency(domain)
    const mainPort = domain.supabase.port || domain.caddy.port

    return (
      <div className="border-b border-slate-200 dark:border-white/10 p-4 last:border-b-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <a
              href={`https://${domain.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline truncate block"
            >
              {domain.domain}
            </a>
            {domain.supabase.email && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{domain.supabase.email}</p>
            )}
          </div>
          <div className="flex gap-1.5 ml-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleRestart(domain.domain)}
              disabled={restarting === domain.domain}
              className="px-2 py-1 text-xs font-medium text-white bg-blue-600 dark:bg-blue-500 rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
            >
              {restarting === domain.domain ? "..." : "Restart"}
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(domain.domain)}
                className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded dark:bg-red-950/30 dark:text-red-300 dark:border-red-800"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="text-center">
            <div className="text-slate-500 dark:text-slate-400 mb-0.5">Port</div>
            <div className={`font-medium ${portCheck.color}`}>
              {mainPort || "—"}
              {portCheck.status === "mismatch" && <span className="ml-1">!</span>}
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-500 dark:text-slate-400 mb-0.5">Files</div>
            <div>
              {domain.filesystem.exists ? (
                <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">✗</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-500 dark:text-slate-400 mb-0.5">DNS</div>
            <div>
              {domain.dns.resolves ? (
                <span
                  className={
                    domain.dns.matchesServer
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {domain.dns.matchesServer ? "✓" : "⚠"}
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">✗</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-500 dark:text-slate-400 mb-0.5">Service</div>
            <div>
              {domain.systemd.exists ? (
                <span
                  className={
                    domain.systemd.active ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }
                >
                  {domain.systemd.active ? "✓" : "✗"}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Source Status Row */}
        <div className="flex items-center gap-2 mt-3 text-xs">
          <span
            className={`font-mono px-1.5 py-0.5 rounded ${domain.supabase.exists ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}
          >
            DB {domain.supabase.exists ? "✓" : "✗"}
          </span>
          <span
            className={`font-mono px-1.5 py-0.5 rounded ${domain.caddy.exists ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}
          >
            Proxy {domain.caddy.exists ? "✓" : "✗"}
          </span>
          {domain.systemd.exists && domain.systemd.serveMode && (
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                domain.systemd.serveMode === "build"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              }`}
            >
              {domain.systemd.serveMode}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile View */}
      <div className="sm:hidden">
        {sources.map(domain => (
          <MobileCard key={domain.domain} domain={domain} />
        ))}
      </div>

      {/* Desktop View */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
          <thead className="bg-white dark:bg-[#2a2a2a]">
            <tr>
              <th className="py-2 px-4 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Domain
              </th>
              <th className="py-2 px-4 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Source
              </th>
              <th className="py-2 px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Port
              </th>
              <th className="py-2 px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Exists
              </th>
              <th className="py-2 px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Files
              </th>
              <th className="py-2 px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                DNS
              </th>
              <th className="py-2 px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Service
              </th>
              <th className="py-2 px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Mode
              </th>
              <th className="py-2 px-4 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Org / Email
              </th>
              <th className="py-2 px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/10 bg-white dark:bg-[#1a1a1a]">
            {sources.map(domain => {
              const portCheck = getPortConsistency(domain)

              return (
                <React.Fragment key={domain.domain}>
                  {/* Supabase row */}
                  <tr
                    key={`${domain.domain}-supabase`}
                    className="hover:bg-slate-50 dark:hover:bg-[#2a2a2a] cursor-pointer"
                    onClick={() => window.open(`https://${domain.domain}`, "_blank")}
                  >
                    <td className="py-2 px-4 text-sm font-medium text-slate-900 dark:text-white" rowSpan={2}>
                      <a
                        href={`https://${domain.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {domain.domain}
                      </a>
                      <div className={`text-xs mt-1 ${portCheck.color}`}>
                        {portCheck.status === "match" && "✓"}
                        {portCheck.status === "mismatch" && "✗"}
                        {portCheck.status === "none" && "—"}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-mono bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">DB</span>
                    </td>
                    <td className="py-2 px-4 text-sm text-slate-700 dark:text-slate-300 text-center">
                      {domain.supabase.port || <span className="text-slate-400 dark:text-slate-500">—</span>}
                    </td>
                    <td className="py-2 px-4 text-sm text-center">
                      {domain.supabase.exists ? (
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">✗</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-sm text-center" rowSpan={2}>
                      {domain.filesystem.exists ? (
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">✗</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-sm text-center" rowSpan={2}>
                      {domain.dns.resolves ? (
                        <span
                          className={
                            domain.dns.matchesServer
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {domain.dns.matchesServer ? "✓" : "⚠"}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">✗</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-sm text-center" rowSpan={2}>
                      {domain.systemd.exists ? (
                        <span
                          className={
                            domain.systemd.active
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {domain.systemd.active ? "✓" : "✗"}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-sm text-center" rowSpan={2}>
                      {domain.systemd.exists ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            domain.systemd.serveMode === "build"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                          }`}
                        >
                          {domain.systemd.serveMode}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-400" rowSpan={2}>
                      {domain.supabase.orgId ? (
                        <div>
                          <div className="font-mono">{domain.supabase.orgId}</div>
                          {domain.supabase.email && (
                            <div className="text-slate-500 dark:text-slate-500 mt-0.5">{domain.supabase.email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-center" rowSpan={2}>
                      <div className="flex flex-col gap-1.5 items-center">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            handleRestart(domain.domain)
                          }}
                          disabled={restarting === domain.domain}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-blue-600 dark:bg-blue-500 rounded hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {restarting === domain.domain ? "Restarting..." : "Restart"}
                        </button>
                        {onDelete && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              onDelete(domain.domain)
                            }}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Caddy row */}
                  <tr
                    key={`${domain.domain}-caddy`}
                    className="hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border-b-2 border-slate-300 dark:border-white/20 cursor-pointer"
                    onClick={() => window.open(`https://${domain.domain}`, "_blank")}
                  >
                    <td className="py-2 px-4 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-mono bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded">Proxy</span>
                    </td>
                    <td className="py-2 px-4 text-sm text-slate-700 dark:text-slate-300 text-center">
                      {domain.caddy.port || <span className="text-slate-400 dark:text-slate-500">—</span>}
                    </td>
                    <td className="py-2 px-4 text-sm text-center">
                      {domain.caddy.exists ? (
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">✗</span>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
