import type { MusicDef } from './types';

/**
 * WebAudio engine: music / sfx buses with voice ducking, procedural SFX
 * recipes, and a pattern-based music player fed by /content/music briefs.
 * All audio is synthesised — zero external assets.
 */

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentMajor: [0, 2, 4, 7, 9],
  pentMinor: [0, 3, 5, 7, 10],
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private duckGain!: GainNode;
  private musicVolume = 0.7;
  private sfxVolume = 0.9;
  private currentMusic: MusicDef | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private combat = false;
  private combatGains: GainNode[] = [];
  private layerGains: GainNode[] = [];

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
    } catch { return; }
    this.duckGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.sfxGain.gain.value = this.sfxVolume;
    this.musicGain.connect(this.duckGain);
    this.duckGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    if (this.currentMusic) this.playMusic(this.currentMusic);
  }

  get unlocked(): boolean { return !!this.ctx; }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music; this.sfxVolume = sfx;
    if (this.ctx) { this.musicGain.gain.value = music; this.sfxGain.gain.value = sfx; }
  }

  /** Duck music −6 dB while a voice line plays. */
  duck(on: boolean, db = -6): void {
    if (!this.ctx) return;
    const target = on ? Math.pow(10, db / 20) : 1;
    this.duckGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  setCombat(on: boolean): void {
    this.combat = on;
    if (!this.ctx) return;
    for (const g of this.combatGains) g.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.4);
  }

  // ---------------- music ----------------
  playMusic(def: MusicDef): void {
    this.currentMusic = def;
    if (!this.ctx) return;
    this.stopMusic();
    this.currentMusic = def;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.combatGains = []; this.layerGains = [];
    for (const layer of def.layers) {
      const g = this.ctx.createGain();
      g.gain.value = layer.combatOnly && !this.combat ? 0 : 1;
      g.connect(this.musicGain);
      this.layerGains.push(g);
      if (layer.combatOnly) this.combatGains.push(g);
    }
    this.schedulerTimer = setInterval(() => this.schedule(), 60);
  }

  stopMusic(): void {
    if (this.schedulerTimer) { clearInterval(this.schedulerTimer); this.schedulerTimer = null; }
    this.currentMusic = null;
  }

  private schedule(): void {
    const ctx = this.ctx, def = this.currentMusic;
    if (!ctx || !def) return;
    const stepDur = 60 / def.tempo / 2; // 8th notes
    while (this.nextStepTime < ctx.currentTime + 0.25) {
      const swing = def.swing && this.step % 2 === 1 ? stepDur * def.swing : 0;
      def.layers.forEach((layer, li) => {
        const pat = layer.pattern;
        const val = pat[this.step % pat.length];
        if (val === null || val === undefined) return;
        const t = this.nextStepTime + swing;
        const dest = this.layerGains[li] ?? this.musicGain;
        if (layer.wave === 'noise') this.noiseHit(t, layer.gain * 0.6, layer.decay ?? 0.08, dest);
        else {
          const scale = SCALES[def.mode] ?? SCALES.major;
          const deg = ((val % scale.length) + scale.length) % scale.length;
          const oct = Math.floor(val / scale.length) + layer.octave;
          const midi = def.root + scale[deg] + 12 * oct;
          this.note(t, midiToFreq(midi), layer.wave as OscillatorType, layer.gain, layer.decay ?? 0.25, dest);
        }
      });
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private note(t: number, freq: number, wave: OscillatorType, gain: number, decay: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave; osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + decay + 0.05);
  }

  private noiseHit(t: number, gain: number, decay: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * decay));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = gain;
    const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 3000;
    src.connect(filter); filter.connect(g); g.connect(dest);
    src.start(t);
  }

  // ---------------- SFX ----------------
  sfx(name: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const play = (freq: number, dur: number, wave: OscillatorType, gain = 0.25, slide = 0, delay = 0) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = wave; osc.frequency.setValueAtTime(freq, t + delay);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + delay + dur);
      g.gain.setValueAtTime(gain, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      osc.connect(g); g.connect(this.sfxGain);
      osc.start(t + delay); osc.stop(t + delay + dur + 0.05);
    };
    const thump = (gain = 0.5, dur = 0.18, freq = 900) => {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
    };
    switch (name) {
      case 'jump': play(320, 0.18, 'sine', 0.22, 260); break;
      case 'doubleJump': play(420, 0.16, 'sine', 0.22, 320); break;
      case 'land': thump(0.25, 0.1, 700); break;
      case 'stomp': thump(0.55, 0.22, 500); play(90, 0.2, 'sine', 0.4, -40); break;
      case 'spin': play(200, 0.22, 'sawtooth', 0.12, 240); break;
      case 'chomp': play(160, 0.09, 'square', 0.2, -60); thump(0.2, 0.06, 1200); break;
      case 'spit': play(500, 0.14, 'square', 0.15, -220); break;
      case 'roar': play(90, 0.7, 'sawtooth', 0.4, 30); play(140, 0.7, 'sawtooth', 0.3, 40, 0.05); thump(0.4, 0.5, 400); break;
      case 'chip': play(1320, 0.12, 'sine', 0.18); play(1760, 0.14, 'sine', 0.14, 0, 0.05); break;
      case 'heart': play(660, 0.12, 'sine', 0.2); play(880, 0.18, 'sine', 0.2, 0, 0.1); break;
      case 'fossil': [523, 659, 784, 1047, 1319].forEach((f, i) => play(f, 0.3, 'triangle', 0.25, 0, i * 0.09)); break;
      case 'correct': play(660, 0.15, 'sine', 0.25); play(990, 0.25, 'sine', 0.25, 0, 0.12); break;
      case 'incorrect': play(330, 0.25, 'sine', 0.18); play(277, 0.3, 'sine', 0.18, 0, 0.18); break;
      case 'uiMove': play(880, 0.05, 'sine', 0.1); break;
      case 'uiSelect': play(660, 0.08, 'sine', 0.15); play(880, 0.1, 'sine', 0.15, 0, 0.06); break;
      case 'hit': thump(0.4, 0.12, 900); play(220, 0.1, 'square', 0.15, -60); break;
      case 'hurt': play(240, 0.25, 'square', 0.2, -120); break;
      case 'telegraph': play(440, 0.3, 'triangle', 0.2, 120); break;
      case 'boing': play(180, 0.35, 'sine', 0.28, 380); break;
      case 'spring': play(240, 0.3, 'sine', 0.3, 520); break;
      case 'checkpoint': play(523, 0.15, 'triangle', 0.2); play(784, 0.22, 'triangle', 0.2, 0, 0.1); break;
      case 'door': thump(0.35, 0.4, 300); play(130, 0.5, 'sine', 0.2, 40); break;
      case 'secret': [784, 988, 1175, 1568].forEach((f, i) => play(f, 0.2, 'sine', 0.18, 0, i * 0.08)); break;
      case 'gear': play(220, 0.08, 'square', 0.12, 30); break;
      case 'steam': thump(0.25, 0.5, 2400); break;
      case 'stun': play(880, 0.4, 'sine', 0.2, -440); break;
      case 'pop': play(600, 0.07, 'sine', 0.25, 300); break;
      case 'splash': thump(0.3, 0.3, 1400); break;
      default: play(440, 0.1, 'sine', 0.1); break;
    }
  }

  /** Short character audio signature (per §8.2) before a voice line. */
  signature(kind: string | undefined): void {
    const ctx = this.ctx; if (!ctx || !kind) return;
    switch (kind) {
      case 'marimba': this.sigNotes([523, 659], 'sine', 0.09); break;
      case 'marimba-high': this.sigNotes([784, 988], 'sine', 0.08); break;
      case 'timpani': this.sfx('land'); break;
      case 'slide-whistle': this.sigSlide(400, 900); break;
      case 'music-box': this.sigNotes([1047, 880], 'triangle', 0.12); break;
      case 'clockwork': this.sfx('gear'); break;
      case 'brass': this.sigNotes([349, 440], 'sawtooth', 0.12); break;
      case 'blip': this.sigNotes([1319], 'square', 0.06); break;
      default: break;
    }
  }
  private sigNotes(freqs: number[], wave: OscillatorType, dur: number): void {
    const ctx = this.ctx!;
    freqs.forEach((f, i) => {
      const t = ctx.currentTime + i * dur;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = wave; osc.frequency.value = f;
      g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 2);
      osc.connect(g); g.connect(this.sfxGain); osc.start(t); osc.stop(t + dur * 2);
    });
  }
  private sigSlide(from: number, to: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + 0.25);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g); g.connect(this.sfxGain); osc.start(t); osc.stop(t + 0.4);
  }
}

function midiToFreq(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

export const audio = new AudioEngine();
