/**
 * Synthesised sound. No assets, no network: everything is built from
 * oscillators and noise so it ships inside the page. Audio only starts after
 * the first user gesture (browser rule), so every call is safe to make early.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Call from any pointer handler so the context is unlocked before the first cue. */
  unlock() {
    this.ensure();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, lowpass: number, when = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  move() {
    this.noise(0.12, 0.25, 1800);
    this.tone(220, 0.08, 'sine', 0.12);
  }
  capture() {
    this.noise(0.25, 0.6, 2500);
    this.tone(110, 0.25, 'triangle', 0.35, 0, 55);
  }
  check() {
    this.tone(880, 0.12, 'square', 0.12);
    this.tone(1320, 0.18, 'square', 0.1, 0.1);
  }
  thud() {
    this.tone(70, 0.5, 'sine', 0.8, 0, 35);
    this.noise(0.35, 0.5, 600);
  }
  whoosh() {
    this.noise(0.5, 0.35, 900);
  }
  thunder() {
    this.noise(1.6, 0.9, 400);
    this.tone(45, 1.4, 'sine', 0.5, 0.05, 30);
  }
  chime() {
    this.tone(1046, 0.25, 'sine', 0.18);
    this.tone(1568, 0.35, 'sine', 0.14, 0.08);
  }
  fanfare() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.5, 'triangle', 0.22, i * 0.12));
    this.tone(2093, 0.9, 'sine', 0.12, 0.5);
  }
  wrong() {
    this.tone(180, 0.18, 'sawtooth', 0.08, 0, 120);
  }
}

export const sfx = new Sfx();
