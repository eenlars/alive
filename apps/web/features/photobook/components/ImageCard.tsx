"use client"

import { Check, Link, Trash2 } from "lucide-react"
import { memo, useState } from "react"

const IMAGE_PATH_PREFIX = "/_images/"

interface ImageCardProps {
  image: {
    key: string
    variants: {
      orig: string
      w640: string
      w1280: string
      thumb: string
    }
  }
  onDelete: (key: string) => void
  onZoom: (imageSrc: string) => void
  onCopy: (url: string, key: string) => void
  isCopied: boolean
}

export const ImageCard = memo(function ImageCard({ image, onDelete, onZoom, onCopy, isCopied }: ImageCardProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const imageUrl = `${IMAGE_PATH_PREFIX}${image.variants.orig}`
  const thumbnailUrl = `${IMAGE_PATH_PREFIX}${image.variants.w640}`

  return (
    <div className="group">
      {/* Card container - using ring instead of border for focus states, shadow-lg for floating feel */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl overflow-hidden shadow-lg ring-1 ring-black/[0.06] dark:ring-white/[0.06] hover:ring-black/[0.10] dark:hover:ring-white/[0.10] transition-all duration-150 ease-in-out">
        <div className="relative">
          <button
            type="button"
            className="cursor-pointer w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 rounded-t-3xl"
            onClick={() => onZoom(imageUrl)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onZoom(imageUrl)
              }
            }}
          >
            {/* Skeleton placeholder - subtle pulse animation */}
            {!isLoaded && <div className="w-full aspect-square bg-black/[0.04] dark:bg-white/[0.06] animate-pulse" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt=""
              className={`w-full h-auto transition-opacity duration-300 ease-out ${isLoaded ? "opacity-100" : "opacity-0 absolute inset-0"}`}
              loading="lazy"
              onLoad={() => setIsLoaded(true)}
            />
          </button>
          {/* Delete button - appears on hover with scale effect */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onDelete(image.key)
            }}
            className="absolute top-3 right-3 size-9 rounded-full bg-black/70 dark:bg-white/80 text-white dark:text-black flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 transition-all duration-150 shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Delete image"
          >
            <Trash2 className="size-4" strokeWidth={2} />
          </button>
        </div>

        {/* Action area with copy button */}
        <div className="p-4">
          <button
            type="button"
            onClick={() => onCopy(imageUrl, image.key)}
            className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium cursor-pointer transition-all duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 ${
              isCopied
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.09] active:bg-black/[0.10] dark:active:bg-white/[0.12] text-black/70 dark:text-white/70"
            }`}
            aria-label={isCopied ? "Link copied" : "Copy image link"}
          >
            {isCopied ? (
              <>
                <Check className="size-4" strokeWidth={2.5} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Link className="size-4" strokeWidth={2} />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
})
