import Image from "next/image"
import { forwardRef, type HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  href?: string
  as?: "div" | "a"
}

const Card = forwardRef<HTMLDivElement | HTMLAnchorElement, CardProps>(
  ({ className, href, as = "div", children, ...props }, ref) => {
    const Component = as === "a" ? "a" : "div"
    const componentProps = as === "a" ? { href, ...props } : { ...props }

    return (
      <Component
        {...((componentProps as any) || {})}
        className={cn(
          "rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-sm transition-colors",
          className,
        )}
        ref={ref as any}
      >
        {children}
      </Component>
    )
  },
)

Card.displayName = "Card"

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(({ className, ...props }, ref) => {
  return <div className={cn("card-content", className)} ref={ref} {...props} />
})

CardContent.displayName = "CardContent"

interface CardImageProps extends HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
}

const CardImage = forwardRef<HTMLDivElement, CardImageProps>(({ className, src, alt, ...props }, ref) => {
  return (
    <div className={cn("card-image relative", className)} ref={ref} {...props}>
      {src && <Image src={src} alt={alt || ""} fill className="object-cover" loading="lazy" unoptimized />}
    </div>
  )
})

CardImage.displayName = "CardImage"

export { Card, CardContent, CardImage }
