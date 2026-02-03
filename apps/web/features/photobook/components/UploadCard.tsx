import { Image as ImageIcon } from "lucide-react"

interface UploadCardProps {
  fileCount: number
  uploading: boolean
  hasExistingImages: boolean
  onUpload: () => void
}

export function UploadCard({ fileCount, uploading, hasExistingImages, onUpload }: UploadCardProps) {
  return (
    <div className={`text-center ${hasExistingImages ? "mb-12" : "py-32"}`}>
      <div className="bg-gray-50 dark:bg-zinc-800 rounded-3xl p-12 max-w-md mx-auto">
        <div className="w-16 h-16 bg-black dark:bg-white rounded-full flex items-center justify-center mx-auto mb-6">
          <ImageIcon className="w-8 h-8 text-white dark:text-black" />
        </div>
        <h3 className="text-xl font-normal text-gray-800 dark:text-gray-200 mb-3">
          {fileCount} image{fileCount > 1 ? "s" : ""} ready
        </h3>
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading}
          className="px-8 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 transition-all cursor-pointer font-medium"
          aria-label={uploading ? "Uploading images" : "Upload selected images"}
        >
          {uploading ? "Uploading..." : "Upload Now"}
        </button>
      </div>
    </div>
  )
}
