import Image from "next/image"
import { APP_LOGO_SRC, APP_SHORT_NAME } from "@/lib/site"
import { cn } from "@/lib/utils"

type BivaLogoProps = {
  className?: string
  /** Display height in pixels (width scales with aspect ratio). */
  height?: number
  priority?: boolean
}

export function BivaLogo({ className, height = 56, priority = false }: BivaLogoProps) {
  const width = Math.round(height * 3.2)
  return (
    <Image
      src={APP_LOGO_SRC}
      alt={APP_SHORT_NAME}
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto max-w-full object-contain", className)}
      style={{ height, width: "auto", maxWidth: width }}
    />
  )
}
