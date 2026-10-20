/** Barcode formats commonly used on retail products. */
const PREFERRED_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'qr_code',
] as const

/** Frames are downscaled before software decoding to keep phones responsive. */
const ZXING_MAX_FRAME_WIDTH = 720
const MIN_DETECT_INTERVAL_MS = 120

/** Common shape of the native BarcodeDetector and the bundled ZXing fallback. */
export type CodeDetector = {
  detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}

export function barcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

/** Camera auto-scan works wherever the camera does (native detector or ZXing fallback). */
export function cameraAutoScanSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

async function createNativeDetector(): Promise<CodeDetector | null> {
  if (!barcodeDetectorSupported()) return null
  try {
    const BarcodeDetectorCtor = window.BarcodeDetector as typeof BarcodeDetector
    const supported = await BarcodeDetectorCtor.getSupportedFormats()
    const formats = PREFERRED_FORMATS.filter((f) =>
      supported.includes(f as unknown as string)
    )
    if (formats.length === 0) return new BarcodeDetectorCtor()
    return new BarcodeDetectorCtor({ formats: [...formats] })
  } catch {
    return null
  }
}

/** Software decoder for browsers without BarcodeDetector (iPhone Safari, Firefox). */
async function createZxingDetector(): Promise<CodeDetector | null> {
  try {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
      await Promise.all([import('@zxing/browser'), import('@zxing/library')])

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null

    return {
      async detect(video) {
        const { videoWidth, videoHeight } = video
        if (!videoWidth || !videoHeight) return []
        const scale = Math.min(1, ZXING_MAX_FRAME_WIDTH / videoWidth)
        canvas.width = Math.round(videoWidth * scale)
        canvas.height = Math.round(videoHeight * scale)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        try {
          const result = reader.decodeFromCanvas(canvas)
          const text = result.getText()
          return text ? [{ rawValue: text }] : []
        } catch {
          // NotFoundException on frames without a readable code.
          return []
        }
      },
    }
  } catch {
    return null
  }
}

export async function createBarcodeDetector(): Promise<CodeDetector | null> {
  return (await createNativeDetector()) ?? (await createZxingDetector())
}

/**
 * Continuously scan frames from a video element until a code is read or cancelled.
 */
export function scanVideoForBarcode(
  video: HTMLVideoElement,
  detector: CodeDetector,
  onCode: (value: string) => void,
  onError?: (message: string) => void
): () => void {
  let cancelled = false
  let busy = false
  let lastDetectAt = 0

  const tick = async () => {
    if (cancelled) return
    if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(tick)
      return
    }
    const now = performance.now()
    if (!busy && now - lastDetectAt >= MIN_DETECT_INTERVAL_MS) {
      busy = true
      lastDetectAt = now
      try {
        const results = await detector.detect(video)
        const value = results[0]?.rawValue?.trim()
        if (value) {
          onCode(value)
          cancelled = true
          return
        }
      } catch {
        onError?.('Scanner lost focus. Try again or enter the code manually.')
      } finally {
        busy = false
      }
    }
    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
  return () => {
    cancelled = true
  }
}

export async function startCameraStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  })
}
