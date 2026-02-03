import { Plus } from "lucide-react"
import Image from "next/image"

interface ImageZoomModalProps {
  imageSrc: string
  onClose: () => void
}

export function ImageZoomModal({ imageSrc, onClose }: ImageZoomModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={e => {
        if (e.key === "Escape") {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Zoomed image view"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: onClick is only for preventing event bubbling, not user interaction */}
      <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
        <Image
          src={imageSrc}
          alt=""
          width={1920}
          height={1080}
          className="max-w-full max-h-full object-contain"
          unoptimized
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-sm transition-all cursor-pointer"
          aria-label="Close zoomed view"
        >
          <Plus className="w-6 h-6 rotate-45" />
        </button>
      </div>
    </div>
  )
}
