export function Header() {
  return (
    <div className="bg-shell-surface p-5 rounded-lg flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 mb-5">
      <h1 className="text-white text-2xl md:text-xl font-semibold">Upload Files</h1>
      <div className="flex gap-2 w-full md:w-auto">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/dashboard"
          }}
          className="flex-1 md:flex-none bg-shell-accent hover:bg-shell-accent-hover text-white border-none px-4 py-2 rounded text-sm cursor-pointer transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/logout"
          }}
          className="flex-1 md:flex-none bg-shell-danger hover:bg-shell-danger-hover text-white border-none px-4 py-2 rounded text-sm cursor-pointer transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
