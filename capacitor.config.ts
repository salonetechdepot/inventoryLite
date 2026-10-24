import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor shell. It opens the hosted site, so a website deploy updates shops
 * that already have the app. Set CAPACITOR_SERVER_URL to that site before
 * syncing a native project, for example https://your-live-biva-host
 */
function serverUrl(): string | undefined {
  const raw = process.env.CAPACITOR_SERVER_URL?.trim()
  if (!raw) return undefined
  return raw.replace(/\/$/, '')
}

const url = serverUrl()

const config: CapacitorConfig = {
  appId: 'com.roarbyte.biva',
  appName: 'BIVA',
  webDir: 'capacitor/www',
  backgroundColor: '#0055FF',
  appendUserAgent: ' BIVAAndroid',
  server: {
    androidScheme: 'https',
    errorPath: 'offline.html',
    ...(url
      ? {
          url,
          cleartext: url.startsWith('http://'),
        }
      : {}),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0055FF',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0055FF',
    },
  },
}

export default config
