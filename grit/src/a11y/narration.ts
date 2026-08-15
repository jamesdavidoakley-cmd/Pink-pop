/**
 * Spoken instructions, so a child who cannot read yet is never stuck.
 * Uses the device's own voice — nothing leaves the tablet.
 */

let enabled = true
let lastSpoken = ''

export function setNarrationEnabled(on: boolean): void {
  enabled = on
  if (!on) stopSpeaking()
}

export function speak(text: string, opts: { force?: boolean } = {}): void {
  if (!enabled || !text) return
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  if (!opts.force && text === lastSpoken) return
  lastSpoken = text

  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1.05
    utterance.lang = 'en-GB'
    window.speechSynthesis.speak(utterance)
  } catch {
    // A device with no voices installed simply stays quiet.
  }
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* nothing to do */
  }
  lastSpoken = ''
}

/** The system-level "I would rather things did not fly about" preference. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
