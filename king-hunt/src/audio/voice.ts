/**
 * The coach's voice: the browser's speech synthesis reading the why-lines
 * and cut-scene captions. No assets, works offline, degrades to silence.
 */
export class Voice {
  enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  private last = '';

  constructor() {
    try {
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.voice =
          voices.find((v) => /en-GB/i.test(v.lang) && /Google|Daniel|Arthur|Serena|Kate/i.test(v.name)) ??
          voices.find((v) => /en-GB/i.test(v.lang)) ??
          voices.find((v) => /^en/i.test(v.lang)) ??
          null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    } catch {
      /* no speech synthesis */
    }
  }

  get available() {
    return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  /** Speak a line, replacing anything still being said. Strips square names into spoken form. */
  say(text: string) {
    if (!this.enabled || !this.available) return;
    const clean = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\b([a-h])([1-8])\b/g, (_m, f: string, r: string) => `${f.toUpperCase()} ${r}`)
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean || clean === this.last) return;
    this.last = clean;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      if (this.voice) u.voice = this.voice;
      u.rate = 1.02;
      u.pitch = 1.0;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  stop() {
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    this.last = '';
  }
}

export const voice = new Voice();
