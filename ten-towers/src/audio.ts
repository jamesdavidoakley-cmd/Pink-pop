// Tiny synth sounds + speech. Nothing external, works offline.

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, slideTo?: number): void {
  const c = ac();
  if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

function noise(start: number, dur: number, gain = 0.25): void {
  const c = ac();
  if (!c || muted) return;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  f.Q.value = 0.7;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export const audio = {
  get muted() { return muted; },
  setMuted(m: boolean) {
    muted = m;
    if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  },
  unlock() { ac(); },
  pop(place = 0) { tone(520 + place * 120, 0, 0.09, 'sine', 0.14, 900 + place * 120); },
  drop() { tone(300, 0, 0.12, 'triangle', 0.12, 160); },
  chime(place = 0) {
    const base = 523 * Math.pow(1.19, place); // C5 climbing per place
    [1, 1.25, 1.5, 2].forEach((r, i) => tone(base * r, i * 0.07, 0.35, 'sine', 0.16));
  },
  crackle() { noise(0, 0.28, 0.3); tone(160, 0, 0.25, 'sawtooth', 0.06, 60); },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.16));
    [262, 330, 392].forEach((f, i) => tone(f, i * 0.11, 0.6, 'sine', 0.1));
  },
  nope() { tone(330, 0, 0.18, 'sine', 0.1, 262); },
  tick() { tone(880, 0, 0.05, 'square', 0.04); },
  speak(text: string) {
    if (muted || !('speechSynthesis' in window)) return;
    const s = window.speechSynthesis;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.92;
    u.pitch = 1.1;
    const voices = s.getVoices();
    const pick = voices.find((v) => /en-GB/i.test(v.lang) && /female|Google UK English Female|Libby|Sonia/i.test(v.name))
      ?? voices.find((v) => /en-GB/i.test(v.lang))
      ?? voices.find((v) => /^en/i.test(v.lang));
    if (pick) u.voice = pick;
    s.speak(u);
  },
};
