import { useEffect, useRef } from "react"
import { fetchSites } from "../api/sites"
import { defaultUploadPath } from "../store/config"
import { useUIStore } from "../store/ui"
import { useDisplayWorkspace, useUploadStore } from "../store/upload"

export function SiteDropdown() {
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const workspace = useUploadStore(s => s.workspace)
  const sites = useUploadStore(s => s.sites)
  const sitesBasePath = useUploadStore(s => s.sitesBasePath)
  const setSites = useUploadStore(s => s.setSites)
  const setSitesBasePath = useUploadStore(s => s.setSitesBasePath)
  const selectWorkspace = useUploadStore(s => s.selectWorkspace)
  const displayWorkspace = useDisplayWorkspace()

  const dropdownOpen = useUIStore(s => s.dropdownOpen)
  const dropdownFilter = useUIStore(s => s.dropdownFilter)
  const highlightedIndex = useUIStore(s => s.highlightedIndex)
  const setDropdownFilter = useUIStore(s => s.setDropdownFilter)
  const setHighlightedIndex = useUIStore(s => s.setHighlightedIndex)
  const openDropdown = useUIStore(s => s.openDropdown)
  const closeDropdown = useUIStore(s => s.closeDropdown)

  useEffect(() => {
    fetchSites().then(data => {
      if (data.sitesPath) setSitesBasePath(data.sitesPath)
      if (data.sites) setSites(data.sites)
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [])

  const searchTerm = dropdownFilter.toLowerCase().trim()
  const rootMatches = !searchTerm || "root".includes(searchTerm) || defaultUploadPath.toLowerCase().includes(searchTerm)
  const filteredSites = sites.filter(site => !searchTerm || site.toLowerCase().includes(searchTerm))

  function handleKeyDown(e: React.KeyboardEvent) {
    const totalItems = (rootMatches ? 1 : 0) + filteredSites.length
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex(Math.min(highlightedIndex + 1, totalItems - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex(Math.max(highlightedIndex - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const idx = highlightedIndex
      if (rootMatches && idx === 0) {
        handleSelect("root")
      } else {
        const siteIdx = rootMatches ? idx - 1 : idx
        if (filteredSites[siteIdx]) handleSelect(`site:${filteredSites[siteIdx]}`)
      }
    } else if (e.key === "Escape") {
      closeDropdown()
      inputRef.current?.blur()
    }
  }

  function handleSelect(value: string) {
    selectWorkspace(value)
    closeDropdown()
  }

  return (
    <div className="mb-5 relative" ref={dropdownRef}>
      <label className="block text-shell-text text-sm mb-2 font-medium">Upload destination</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search websites or type path..."
            autoComplete="off"
            value={dropdownOpen ? dropdownFilter : displayWorkspace}
            onFocus={() => {
              openDropdown()
            }}
            onInput={e => {
              setDropdownFilter(e.currentTarget.value)
              if (!dropdownOpen) openDropdown()
            }}
            onKeyDown={handleKeyDown}
            className="w-full p-3 pr-9 border border-shell-border bg-shell-bg text-white rounded text-sm focus:outline-none focus:border-shell-accent placeholder:text-shell-text-muted"
          />
          {dropdownFilter && (
            <button
              type="button"
              onClick={() => {
                setDropdownFilter("")
                inputRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-shell-text-muted hover:text-white cursor-pointer text-base p-1"
            >
              &times;
            </button>
          )}
          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 bg-shell-surface border border-shell-accent rounded max-h-72 overflow-y-auto z-[1000] shadow-lg mt-1">
              {rootMatches && (
                <div
                  onClick={() => handleSelect("root")}
                  className={`p-2.5 cursor-pointer border-b border-[#3a3a3a] transition-colors hover:bg-[#3a3a3a] ${workspace === "root" ? "bg-shell-accent" : ""} ${highlightedIndex === 0 ? "bg-[#3a3a3a]" : ""}`}
                >
                  <div className="text-white text-sm mb-0.5 break-words">Root</div>
                  <div
                    className={`text-xs break-all ${workspace === "root" ? "text-white/80" : "text-shell-text-muted"}`}
                  >
                    {defaultUploadPath}
                  </div>
                </div>
              )}
              {filteredSites.length > 0 && (
                <>
                  <div className="p-2 text-shell-text-muted text-xs font-semibold uppercase bg-[#252525] sticky top-0">
                    Websites ({filteredSites.length})
                  </div>
                  {filteredSites.map((site, idx) => {
                    const itemIdx = rootMatches ? idx + 1 : idx
                    const isSelected = workspace === `site:${site}`
                    return (
                      <div
                        key={site}
                        onClick={() => handleSelect(`site:${site}`)}
                        className={`p-2.5 cursor-pointer border-b border-[#3a3a3a] last:border-b-0 transition-colors hover:bg-[#3a3a3a] ${isSelected ? "bg-shell-accent" : ""} ${highlightedIndex === itemIdx ? "bg-[#3a3a3a]" : ""}`}
                      >
                        <div className="text-white text-sm mb-0.5 break-words">{site}</div>
                        <div className={`text-xs break-all ${isSelected ? "text-white/80" : "text-shell-text-muted"}`}>
                          {sitesBasePath}/{site}/user
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
              {!rootMatches && filteredSites.length === 0 && (
                <div className="p-4 text-shell-text-muted text-center text-sm">No matching sites found</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
