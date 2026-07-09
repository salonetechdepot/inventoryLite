/** Short tone after a successful product scan (handheld POS feedback). */
export function playScanBeep(success: boolean): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.frequency.value = success ? 1180 : 420
    gain.gain.value = 0.12
    const duration = success ? 0.07 : 0.14
    oscillator.start()
    oscillator.stop(ctx.currentTime + duration)
    window.setTimeout(() => void ctx.close(), 250)
  } catch {
    // Audio not available — ignore.
  }
}
