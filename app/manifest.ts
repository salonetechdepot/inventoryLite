import type { MetadataRoute } from "next"
import {
  APP_BACKGROUND_COLOR,
  APP_DEFAULT_DESCRIPTION,
  APP_LOGO_SRC,
  APP_SHORT_NAME,
  APP_TAGLINE,
  APP_THEME_COLOR,
} from "@/lib/site"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${APP_SHORT_NAME} — ${APP_TAGLINE}`,
    short_name: APP_SHORT_NAME,
    description: APP_DEFAULT_DESCRIPTION,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: APP_BACKGROUND_COLOR,
    theme_color: APP_THEME_COLOR,
    orientation: "portrait",
    shortcuts: [
      {
        name: "Sell",
        short_name: "Sell",
        description: "Open the Sell screen",
        url: "/dashboard/sell",
        icons: [{ src: APP_LOGO_SRC, sizes: "512x512", type: "image/jpeg" }],
      },
    ],
    icons: [
      {
        src: APP_LOGO_SRC,
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: APP_LOGO_SRC,
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  }
}
