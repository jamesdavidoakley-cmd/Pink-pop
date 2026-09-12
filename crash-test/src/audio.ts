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
  unlock() {
    ac();
    if ('speechSynthesis' in window) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
  },
  click() { tone(660, 0, 0.05, 'square', 0.04); },
  place() { tone(220, 0, 0.09, 'triangle', 0.16, 160); noise(0, 0.05, 0.08); },
  erase() { tone(440, 0, 0.12, 'sine', 0.1, 220); },
  testStart() { [262, 330, 392, 523].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle', 0.14)); },
  held() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.35, 'sine', 0.15)); },
  creak() { tone(180, 0, 0.3, 'sawtooth', 0.05, 120); },
  snap() { noise(0, 0.12, 0.4); tone(900, 0, 0.08, 'square', 0.1, 300); },
  crash() { noise(0, 0.6, 0.45); tone(70, 0, 0.5, 'sawtooth', 0.2, 35); },
  cheer() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.16));
    [262, 330, 392].forEach((f, i) => tone(f, i * 0.11, 0.6, 'sine', 0.1));
  },
  bleat() { tone(520, 0, 0.12, 'sawtooth', 0.06, 640); tone(560, 0.14, 0.12, 'sawtooth', 0.06, 480); },
  rumble() { noise(0, 1.0, 0.16); tone(45, 0, 1.0, 'sawtooth', 0.1, 30); },
  thud() { noise(0, 0.25, 0.3); tone(80, 0, 0.3, 'sine', 0.2, 40); },
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
