import { forwardRef, type HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "wide"
}

const Container = forwardRef<HTMLDivElement, ContainerProps>(({ className, variant = "default", ...props }, ref) => {
  return <div className={cn(variant === "wide" ? "container-wide" : "container", className)} ref={ref} {...props} />
})

Container.displayName = "Container"

interface GridProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "portfolio" | "footer" | "custom"
  columns?: number
}

const Grid = forwardRef<HTMLDivElement, GridProps>(
  ({ className, variant = "custom", columns, style, ...props }, ref) => {
    const getGridClass = () => {
      switch (variant) {
        case "portfolio":
          return "grid-portfolio"
        case "footer":
          return "grid-footer"
        default:
          return ""
      }
    }

    const gridStyle = columns
      ? {
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: "var(--grid-gap)",
          ...style,
        }
      : style

    return <div className={cn(getGridClass(), className)} style={gridStyle} ref={ref} {...props} />
  },
)

Grid.displayName = "Grid"

interface NavbarProps extends HTMLAttributes<HTMLElement> {
  fixed?: boolean
}

const Navbar = forwardRef<HTMLElement, NavbarProps>(({ className, fixed = true, ...props }, ref) => {
  return <nav className={cn("navbar", !fixed && "relative", className)} ref={ref} {...props} />
})

Navbar.displayName = "Navbar"

interface NavSectionProps extends HTMLAttributes<HTMLDivElement> {
  position?: "left" | "right"
}

const NavSection = forwardRef<HTMLDivElement, NavSectionProps>(({ className, position = "left", ...props }, ref) => {
  return <div className={cn(position === "left" ? "nav-left" : "nav-right", className)} ref={ref} {...props} />
})

NavSection.displayName = "NavSection"

interface NavLinksProps extends HTMLAttributes<HTMLDivElement> {}

const NavLinks = forwardRef<HTMLDivElement, NavLinksProps>(({ className, ...props }, ref) => {
  return <div className={cn("nav-links", className)} ref={ref} {...props} />
})

NavLinks.displayName = "NavLinks"

export { Container, Grid, NavLinks, NavSection, Navbar }
