import { APP_SHORT_NAME } from "@/lib/site"
import { cn } from "@/lib/utils"

type BivaLogoProps = {
  className?: string
  /** Display height in pixels. Width follows the SVG aspect ratio. */
  height?: number
  priority?: boolean
}

export function BivaLogo({ className, height = 56, priority = false }: BivaLogoProps) {
  return (
    <img
      src="/biva-logo.svg"
      alt={APP_SHORT_NAME}
      width={825}
      height={271}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      className={cn("w-auto max-w-full", className)}
      style={{ height }}
    />
  )
}
