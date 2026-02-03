"use client"

interface DomainsTableProps {
  domains: Record<string, any>
  statuses: Record<string, any>
  deleting: string | null
  onDelete: (domain: string) => void
  onEdit: (domain: string) => void
  onCheck: (domain: string) => void
  onFixPort: (domain: string) => void
  getStatusColor: (domain: string) => string
  getStatusText: (domain: string) => string
  getInfrastructureChecks: (domain: string) => any[] | null
  formatCreatedDate: (date: string) => string
}

export function DomainsTable({
  domains,
  statuses,
  deleting,
  onDelete,
  onEdit,
  onCheck,
  onFixPort,
  getStatusColor,
  getStatusText,
  getInfrastructureChecks,
  formatCreatedDate,
}: DomainsTableProps) {
  const stats = (() => {
    let total = 0,
      online = 0,
      httpOnly = 0,
      offline = 0,
      withIssues = 0

    Object.values(statuses).forEach((status: any) => {
      total++
      if (status.httpsAccessible) online++
      else if (status.httpAccessible) httpOnly++
      else if (status.portListening) withIssues++
      else offline++
    })

    return { total, online, httpOnly, offline, withIssues }
  })()

  if (Object.keys(domains).length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">No domains found</p>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Deploy your first site to get started</p>
      </div>
    )
  }

  return (
    <>
      {Object.keys(statuses).length > 0 && (
        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10">
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 dark:text-white">{stats.total}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-emerald-600">{stats.online}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Online</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-amber-600">{stats.httpOnly}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">HTTP Only</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-red-600">{stats.offline}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Offline</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-orange-600">{stats.withIssues}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Issues</div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
          <thead className="bg-white dark:bg-[#2a2a2a]">
            <tr>
              <th
                scope="col"
                className="py-3.5 px-6 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider"
              >
                Domain
              </th>
              <th
                scope="col"
                className="py-3.5 px-6 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="py-3.5 px-6 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider"
              >
                Port
              </th>
              <th
                scope="col"
                className="py-3.5 px-6 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider"
              >
                Mode
              </th>
              <th scope="col" className="relative py-3.5 px-6">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/10 bg-white dark:bg-[#1a1a1a]">
            {Object.entries(domains).map(([domain, config]) => (
              <tr key={domain} className="hover:bg-slate-50 dark:hover:bg-[#333]">
                <td className="py-4 px-6 text-sm">
                  <div className="font-medium text-slate-900 dark:text-white">{domain}</div>
                  {config.orphaned && <div className="text-xs text-amber-600 mt-1">Orphaned</div>}
                  {statuses[domain]?.createdAt && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Created {formatCreatedDate(statuses[domain].createdAt)}
                    </div>
                  )}
                </td>
                <td className="py-4 px-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(domain)}`} />
                    <span className="text-slate-700 dark:text-slate-300">{getStatusText(domain)}</span>
                  </div>
                  {(() => {
                    const checks = getInfrastructureChecks(domain)
                    if (!checks || checks.length === 0) return null
                    const failed = checks.filter((c: any) => !c.pass)
                    if (failed.length === 0) return null
                    return (
                      <div className="text-xs text-red-600 mt-1 group relative cursor-help">
                        {failed.length} issue{failed.length !== 1 ? "s" : ""}
                        <div className="invisible group-hover:visible absolute left-0 top-full mt-1 z-10 w-64 p-3 bg-slate-900 dark:bg-slate-800 text-white rounded-lg shadow-xl border border-slate-700">
                          <div className="text-xs font-semibold mb-2">Failed checks:</div>
                          <div className="space-y-1.5">
                            {failed.map((check: any, idx: number) => (
                              <div key={idx} className="text-xs">
                                <div className="font-medium text-red-400">{check.label}</div>
                                <div className="text-slate-300 ml-2">{check.detail}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </td>
                <td className="py-4 px-6 text-sm text-slate-700 dark:text-slate-300">
                  {config.orphaned ? <span className="text-slate-400 dark:text-slate-500">—</span> : config.port}
                </td>
                <td className="py-4 px-6 text-sm">
                  {statuses[domain]?.serveMode ? (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        statuses[domain].serveMode === "build"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                      }`}
                    >
                      {statuses[domain].serveMode}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                  )}
                </td>
                <td className="py-4 px-6 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    {statuses[domain]?.vitePortMismatch && (
                      <button
                        type="button"
                        onClick={() => onFixPort(domain)}
                        className="text-xs px-2.5 py-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-900/40 transition-colors"
                      >
                        Fix port
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onCheck(domain)}
                      className="text-xs px-2.5 py-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-[#333] dark:text-slate-300 dark:border-white/20 dark:hover:bg-[#444] transition-colors"
                    >
                      Check
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(domain)}
                      disabled={config.orphaned}
                      className="text-xs px-2.5 py-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(domain)}
                      disabled={deleting === domain}
                      className="text-xs px-2.5 py-1.5 text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {deleting === domain ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
