import type { CSSProperties, ReactNode } from "react"

interface GlowCardProps {
  children: ReactNode
  brandColor?: string
  lineColor?: string
  startAngle?: number
  delay?: number
  className?: string
}

export function GlowCard({
  children,
  brandColor = "#10b981",
  lineColor,
  startAngle = 0,
  delay = 0,
  className = "",
}: GlowCardProps) {
  const style = {
    "--brand-color": brandColor,
    "--line-color": lineColor ?? brandColor,
    "--start-angle": `${startAngle}deg`,
    "--delay": `${delay}s`,
  } as CSSProperties

  return (
    <div className={`glow-card rounded-2xl ${className}`} style={style}>
      <div className="glow-card-effect rounded-2xl" />
      <div className="glow-card-content rounded-2xl">{children}</div>
    </div>
  )
}
