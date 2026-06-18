/** Shape Detection API — supported in Chrome/Edge on Android and desktop. */
interface BarcodeDetectorOptions {
  formats?: string[]
}

interface DetectedBarcode {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
  cornerPoints: ReadonlyArray<{ x: number; y: number }>
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions)
  static getSupportedFormats(): Promise<string[]>
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>
}

interface Window {
  BarcodeDetector: typeof BarcodeDetector
}
