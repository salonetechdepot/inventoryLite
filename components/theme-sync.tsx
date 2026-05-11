"use client"

import { useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"

function getContrastForeground(hexColor: string) {
  const normalized = hexColor.replace("#", "")
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#111827" : "#FFFFFF"
}

export function ThemeSync() {
  const { user } = useAuth()

  useEffect(() => {
    const root = document.documentElement
    if (!user?.theme_color) {
      root.style.removeProperty("--primary")
      root.style.removeProperty("--ring")
      root.style.removeProperty("--success")
      root.style.removeProperty("--primary-foreground")
      return
    }

    root.style.setProperty("--primary", user.theme_color)
    root.style.setProperty("--ring", user.theme_color)
    root.style.setProperty("--success", user.theme_color)
    root.style.setProperty("--primary-foreground", getContrastForeground(user.theme_color))
  }, [user?.theme_color])

  return null
}
