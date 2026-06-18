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

export function barcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

export async function createBarcodeDetector(): Promise<BarcodeDetector | null> {
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

/**
 * Continuously scan frames from a video element until a code is read or cancelled.
 */
export function scanVideoForBarcode(
  video: HTMLVideoElement,
  detector: BarcodeDetector,
  onCode: (value: string) => void,
  onError?: (message: string) => void
): () => void {
  let cancelled = false
  let busy = false

  const tick = async () => {
    if (cancelled) return
    if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(tick)
      return
    }
    if (!busy) {
      busy = true
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
