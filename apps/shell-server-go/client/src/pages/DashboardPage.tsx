import { useConfig } from "../store/config"

export function DashboardPage() {
  const config = useConfig()
  const defaultWorkspace = encodeURIComponent(config?.defaultWorkspace || "root")

  return (
    <div className="m-0 p-5 box-border font-sans bg-shell-bg min-h-screen flex items-center justify-center">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="bg-shell-surface p-5 rounded-t-lg flex justify-between items-center">
          <h1 className="text-white text-2xl font-semibold">Shell Dashboard</h1>
          <button
            onClick={() => (window.location.href = "/logout")}
            className="bg-shell-danger hover:bg-shell-danger-hover text-white border-none px-4 py-2 rounded text-sm cursor-pointer transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Options Grid */}
        <div className="bg-shell-surface p-6 rounded-b-lg grid grid-cols-1 md:grid-cols-3 gap-5">
          <a
            href={`/shell?workspace=${defaultWorkspace}`}
            className="bg-shell-bg border-2 border-shell-border rounded-lg py-8 px-4 text-center cursor-pointer transition-all hover:border-shell-accent hover:bg-[#252525] no-underline block"
          >
            <div className="text-5xl mb-4">🖥️</div>
            <div className="text-white text-lg font-semibold mb-2">Shell Terminal</div>
            <div className="text-shell-text-muted text-sm break-all">{config?.shellDefaultPath || "/root"}</div>
          </a>

          <a
            href={`/upload?workspace=${defaultWorkspace}`}
            className="bg-shell-bg border-2 border-shell-border rounded-lg py-8 px-4 text-center cursor-pointer transition-all hover:border-shell-accent hover:bg-[#252525] no-underline block"
          >
            <div className="text-5xl mb-4">📦</div>
            <div className="text-white text-lg font-semibold mb-2">Upload Files</div>
            <div className="text-shell-text-muted text-sm break-all">Choose destination on next page</div>
          </a>

          <a
            href="/edit"
            className="bg-shell-bg border-2 border-shell-border rounded-lg py-8 px-4 text-center cursor-pointer transition-all hover:border-shell-accent hover:bg-[#252525] no-underline block"
          >
            <div className="text-5xl mb-4">✏️</div>
            <div className="text-white text-lg font-semibold mb-2">Edit Files</div>
            <div className="text-shell-text-muted text-sm break-all">Edit workflows and config files</div>
          </a>
        </div>
      </div>
    </div>
  )
}
