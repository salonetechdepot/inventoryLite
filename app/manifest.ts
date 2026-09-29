import type { MetadataRoute } from "next"
import { APP_DEFAULT_DESCRIPTION, APP_SHORT_NAME, APP_TAGLINE } from "@/lib/site"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${APP_SHORT_NAME} — ${APP_TAGLINE}`,
    short_name: APP_SHORT_NAME,
    description: APP_DEFAULT_DESCRIPTION,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#16a34a",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  }
}
