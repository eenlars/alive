import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Dropzone } from "../components/Dropzone"
import { FilePreview } from "../components/FilePreview"
import { FileTree } from "../components/FileTree"
import { Header } from "../components/Header"
import { Message } from "../components/Message"
import { SiteDropdown } from "../components/SiteDropdown"
import { UploadControls } from "../components/UploadControls"
import { useConfigStore } from "../store/config"

export function UploadPage() {
  const [searchParams] = useSearchParams()
  const workspace = searchParams.get("workspace") || "root"
  const [selectedFilePath, setSelectedFilePath] = useState("")
  const config = useConfigStore(s => s.config)

  // Set upload path based on workspace
  useEffect(() => {
    if (!config) return

    let uploadPath: string
    if (workspace.startsWith("site:")) {
      const siteName = workspace.replace("site:", "")
      uploadPath = `${config.sitesPath}/${siteName}/user`
    } else if (workspace === "root") {
      uploadPath = config.uploadPath
    } else {
      uploadPath = `${config.workspaceBase}/${workspace}`
    }
    // Store upload path globally for other components
    ;(window as any).__UPLOAD_PATH__ = uploadPath
  }, [workspace, config])

  function handleUploadSuccess() {
    setSelectedFilePath("")
  }

  return (
    <div className="m-0 p-5 md:p-2.5 box-border font-sans bg-shell-bg min-h-screen">
      <style>
        {`
          .main-content.grid-3col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
          pre code, .hljs { background: transparent !important; }
          pre code { padding: 0 !important; }
          @media (max-width: 1400px) {
            .main-content.grid-3col { grid-template-columns: 1fr 1fr; }
            .main-content.grid-3col > div:nth-child(3) { display: none !important; }
          }
          @media (max-width: 900px) {
            .main-content.grid-3col { grid-template-columns: 1fr; }
            .main-content.grid-3col > div:nth-child(2) { display: none !important; }
          }
        `}
      </style>
      <div className="container max-w-[1800px] mx-auto transition-all duration-300">
        <Header />
        <div className="main-content grid-3col">
          <div className="bg-shell-surface p-8 md:p-5 rounded-lg">
            <SiteDropdown />
            <Dropzone />
            <UploadControls onUploadSuccess={handleUploadSuccess} />
            <Message />
          </div>
          <FileTree onFileSelect={setSelectedFilePath} />
          <FilePreview filePath={selectedFilePath} />
        </div>
      </div>
    </div>
  )
}
