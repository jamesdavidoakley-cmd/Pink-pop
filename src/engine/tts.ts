import type { CharacterDef } from './types';

/**
 * VoiceProvider interface + three implementations (§8.3):
 *  - WebSpeechProvider: free browser speechSynthesis (default)
 *  - NullProvider: silent, subtitle-timed fallback
 *  - ElevenLabsProvider: premium stub, only constructed when VITE_ELEVENLABS_KEY exists
 * TTS failure must never stall dialogue — every speak() resolves.
 */

export interface VoiceProfile {
  rate: number; pitch: number; volume?: number; langPref?: string; namePref?: string[];
}

export interface VoiceProvider {
  readonly name: string;
  available(): boolean;
  /** Resolves when the line finishes (or immediately on failure). */
  speak(text: string, profile: VoiceProfile, rateMultiplier: number): Promise<void>;
  stop(): void;
}

/** Estimated reading time for subtitle pacing when nothing is spoken. */
export function readingSeconds(text: string, rate = 1): number {
  const words = Math.max(2, text.split(/\s+/).length);
  return Math.min(9, (0.42 * words + 0.6) / Math.max(0.5, rate));
}

export class NullProvider implements VoiceProvider {
  readonly name = 'null';
  available(): boolean { return true; }
  private timer: ReturnType<typeof setTimeout> | null = null;
  private resolver: (() => void) | null = null;
  speak(text: string, profile: VoiceProfile, rateMultiplier: number): Promise<void> {
    this.stop();
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.timer = setTimeout(() => { this.timer = null; this.resolver = null; resolve(); },
        readingSeconds(text, profile.rate * rateMultiplier) * 1000);
    });
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.resolver?.(); this.resolver = null;
  }
}

export class WebSpeechProvider implements VoiceProvider {
  readonly name = 'webspeech';
  private voices: SpeechSynthesisVoice[] = [];
  /** Keep a strong ref to the active utterance — some browsers GC it mid-line. */
  private current: SpeechSynthesisUtterance | null = null;
  private safety: ReturnType<typeof setTimeout> | null = null;
  private resolver: (() => void) | null = null;

  activeUtterance(): SpeechSynthesisUtterance | null { return this.current; }

  constructor() {
    if (!this.available()) return;
    const load = () => { this.voices = speechSynthesis.getVoices(); };
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  private pickVoice(profile: VoiceProfile): SpeechSynthesisVoice | null {
    if (!this.voices.length) this.voices = speechSynthesis.getVoices();
    if (!this.voices.length) return null;
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1;
    for (const v of this.voices) {
      let score = 0;
      const lang = profile.langPref ?? 'en-GB';
      if (v.lang === lang) score += 4;
      else if (v.lang?.startsWith(lang.split('-')[0])) score += 2;
      for (const [i, pref] of (profile.namePref ?? []).entries()) {
        if (v.name.includes(pref) || v.lang.includes(pref)) score += 6 - i;
      }
      if (v.localService) score += 1;
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return best;
  }

  speak(text: string, profile: VoiceProfile, rateMultiplier: number): Promise<void> {
    this.stop();
    return new Promise((resolve) => {
      if (!this.available()) { resolve(); return; }
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        if (this.safety) { clearTimeout(this.safety); this.safety = null; }
        this.current = null; this.resolver = null;
        resolve();
      };
      this.resolver = finish;
      try {
        const u = new SpeechSynthesisUtterance(text);
        const voice = this.pickVoice(profile);
        if (voice) u.voice = voice;
        u.rate = clamp(profile.rate * rateMultiplier, 0.5, 2);
        u.pitch = clamp(profile.pitch, 0, 2);
        u.volume = profile.volume ?? 1;
        u.onend = finish;
        u.onerror = finish;
        this.current = u;
        speechSynthesis.speak(u);
        // Safety net: some browsers drop onend. Never let dialogue hang.
        this.safety = setTimeout(finish, (readingSeconds(text, u.rate) + 3) * 1000);
      } catch {
        finish();
      }
    });
  }

  stop(): void {
    try { if (this.available()) speechSynthesis.cancel(); } catch { /* ignore */ }
    this.resolver?.();
  }
}

/**
 * Premium upgrade path (documented in AUTHORING.md). Only constructed when
 * VITE_ELEVENLABS_KEY is present; any failure falls back to the next provider.
 */
export class ElevenLabsProvider implements VoiceProvider {
  readonly name = 'elevenlabs';
  constructor(private key: string, private fallback: VoiceProvider) {}
  available(): boolean { return !!this.key; }
  async speak(text: string, profile: VoiceProfile, rateMultiplier: number): Promise<void> {
    // Stub: a real integration would POST to the ElevenLabs TTS endpoint and
    // play the returned audio. Until then we delegate so the game always speaks.
    return this.fallback.speak(text, profile, rateMultiplier);
  }
  stop(): void { this.fallback.stop(); }
}

export class TTSManager {
  private provider: VoiceProvider;
  voiceOn = true;
  rateMultiplier = 1;
  private silent = new NullProvider();
  onSpeakingChange: ((speaking: boolean) => void) | null = null;

  constructor() {
    const web = new WebSpeechProvider();
    const key = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ELEVENLABS_KEY;
    const base: VoiceProvider = web.available() ? web : this.silent;
    this.provider = key ? new ElevenLabsProvider(key, base) : base;
  }

  get providerName(): string { return this.voiceOn ? this.provider.name : 'null'; }

  /** Speak a line with a character's profile; always resolves. */
  async speak(character: Pick<CharacterDef, 'voice'>, text: string): Promise<void> {
    const clean = text.replace(/\{[^}]+\}/g, '').replace(/[*_#]/g, '');
    const active = this.voiceOn ? this.provider : this.silent;
    await active.speak(clean, character.voice, this.rateMultiplier);
  }

  stop(): void { this.provider.stop(); this.silent.stop(); }
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

export const tts = new TTSManager();
