import { createElement, forwardRef, type HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  weight?: "ultra" | "light" | "normal"
  size?: "xs" | "sm" | "base" | "lg" | "xl"
  transform?: "uppercase" | "lowercase" | "none"
}

const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 1, weight = "light", size = "lg", transform = "uppercase", ...props }, ref) => {
    const Component = `h${level}` as React.ElementType

    return (
      <Component
        className={cn(`text-${weight}`, `text-${size}`, `text-${transform}`, "text-black dark:text-white", className)}
        ref={ref}
        {...props}
      />
    )
  },
)

Heading.displayName = "Heading"

interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  as?: "p" | "span" | "div"
  weight?: "ultra" | "light" | "normal"
  size?: "xs" | "sm" | "base" | "lg" | "xl"
  color?: "primary" | "muted" | "subtle"
  transform?: "uppercase" | "lowercase" | "none"
}

const Text = forwardRef<HTMLParagraphElement, TextProps>(
  (
    { className, as = "p", weight = "light", size = "base", color = "primary", transform = "uppercase", ...props },
    ref,
  ) => {
    const colorClasses =
      color === "primary"
        ? "text-black dark:text-white"
        : color === "muted"
          ? "text-black/60 dark:text-white/60"
          : "text-black/40 dark:text-white/40"

    return createElement(as, {
      className: cn(`text-${weight}`, `text-${size}`, `text-${transform}`, colorClasses, className),
      ref,
      ...props,
    })
  },
)

Text.displayName = "Text"

interface LinkProps extends HTMLAttributes<HTMLAnchorElement> {
  href: string
  underline?: boolean
  external?: boolean
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, href, underline = false, external = false, ...props }, ref) => {
    return (
      <a
        className={cn(
          "text-primary text-light transition-colors hover:text-muted",
          underline && "link-underline",
          className,
        )}
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        ref={ref}
        {...props}
      />
    )
  },
)

Link.displayName = "Link"

export { Heading, Text, Link }
