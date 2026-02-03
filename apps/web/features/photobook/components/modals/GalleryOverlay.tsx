import { X } from "lucide-react"
import Image from "next/image"

const IMAGE_PATH_PREFIX = "/_images/"

interface GalleryOverlayProps {
  images: Array<{
    key: string
    variants: {
      orig: string
      w640: string
      w1280: string
      thumb: string
    }
  }>
  onClose: () => void
}

export function GalleryOverlay({ images, onClose }: GalleryOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center overflow-x-auto overflow-y-hidden">
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-sm transition-all cursor-pointer z-10"
        aria-label="Close gallery"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Photo gallery - horizontal scrolling, photos side by side */}
      <div className="flex gap-4 p-8">
        {images.map(image => {
          const imageUrl = `${IMAGE_PATH_PREFIX}${image.variants.orig}`
          return (
            <Image
              key={image.key}
              src={imageUrl}
              alt=""
              width={600}
              height={600}
              className="h-[60vh] w-auto object-contain"
              unoptimized
            />
          )
        })}
      </div>
    </div>
  )
}
