/**
 * All of the game's sound, generated with the Web Audio API. No files.
 *
 * The one that earns its keep is `setPanic`: a low sine that rises in pitch as
 * the herd's nerve goes. The player spends the whole game looking at animals
 * rather than at the calm bar, so the herd's state has to be audible. By the
 * time the rumble is uncomfortable you already know to turn round, and you
 * knew it without reading anything.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rumbleOsc: OscillatorNode | null = null
  private rumbleGain: GainNode | null = null
  private lowingTimer = 0
  private noiseBuffer: AudioBuffer | null = null
  muted = false

  /** Browsers will not start audio without a gesture, so this is called late. */
  ensure(): void {
    if (this.ctx) return
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.55
      this.master.connect(this.ctx.destination)
      this.startRumble()
    } catch {
      // No audio available. The game is entirely playable in silence.
      this.ctx = null
    }
  }

  resume(): void {
    void this.ctx?.resume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05)
    }
  }

  dispose(): void {
    try {
      this.rumbleOsc?.stop()
      void this.ctx?.close()
    } catch {
      /* already gone */
    }
    this.ctx = null
    this.master = null
    this.rumbleOsc = null
  }

  /* --------------------------------------------------------------- utils */

  private get now(): number {
    return this.ctx?.currentTime ?? 0
  }

  private noise(): AudioBuffer | null {
    if (!this.ctx) return null
    if (this.noiseBuffer) return this.noiseBuffer
    const len = this.ctx.sampleRate * 1.2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf
    return buf
  }

  private env(gain: GainNode, peak: number, attack: number, decay: number, at = this.now): void {
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  }

  private tone(
    type: OscillatorType,
    freq: number,
    peak: number,
    attack: number,
    decay: number,
    opts?: { to?: number; at?: number; filter?: number; detune?: number },
  ): void {
    if (!this.ctx || !this.master) return
    const at = opts?.at ?? this.now
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    if (opts?.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), at + attack + decay)
    if (opts?.detune) osc.detune.value = opts.detune
    let node: AudioNode = gain
    if (opts?.filter) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = opts.filter
      gain.connect(f)
      node = f
    }
    osc.connect(gain)
    node.connect(this.master)
    this.env(gain, peak, attack, decay, at)
    osc.start(at)
    osc.stop(at + attack + decay + 0.05)
  }

  private burst(
    peak: number,
    duration: number,
    filterFrom: number,
    filterTo: number,
    type: BiquadFilterType = 'lowpass',
    at = this.now,
  ): void {
    if (!this.ctx || !this.master) return
    const buf = this.noise()
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(filterFrom, at)
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), at + duration)
    const gain = this.ctx.createGain()
    this.env(gain, peak, duration * 0.12, duration * 0.88, at)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(at)
    src.stop(at + duration + 0.05)
  }

  /* ------------------------------------------------------- the panic hum */

  private startRumble(): void {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 38
    gain.gain.value = 0
    osc.connect(gain)
    gain.connect(this.master)
    osc.start()
    this.rumbleOsc = osc
    this.rumbleGain = gain
  }

  /** `panic` is 0 (herd content) to 1 (stampede). Drives pitch and volume. */
  setPanic(panic: number): void {
    if (!this.ctx || !this.rumbleOsc || !this.rumbleGain) return
    const t = this.ctx.currentTime
    this.rumbleOsc.frequency.setTargetAtTime(34 + panic * panic * 76, t, 0.35)
    this.rumbleGain.gain.setTargetAtTime(0.03 + panic * 0.26, t, 0.4)
  }

  /* ----------------------------------------------------------- the herd */

  /** Layered low triangles. Called on a loose timer while the herd is calm. */
  lowing(pitch = 1): void {
    if (!this.ctx) return
    const base = 96 * pitch
    this.tone('triangle', base, 0.09, 0.16, 0.7, { to: base * 0.82, filter: 500 })
    this.tone('triangle', base * 1.5, 0.05, 0.2, 0.6, { to: base * 1.2, filter: 700 })
  }

  /** Heads-up, stamping, nervous. A shorter, higher call. */
  skittishCall(): void {
    this.tone('triangle', 210, 0.08, 0.05, 0.35, { to: 150, filter: 900 })
  }

  updateAmbient(dt: number, calmAverage: number, alive: number): void {
    if (!this.ctx || alive === 0) return
    this.lowingTimer -= dt
    if (this.lowingTimer > 0) return
    // Content herds low often and slowly; nervy ones call short and sharp.
    if (calmAverage > 60) {
      this.lowing(0.9 + Math.random() * 0.3)
      this.lowingTimer = 3.5 + Math.random() * 5
    } else {
      this.skittishCall()
      this.lowingTimer = 1.6 + Math.random() * 2.4
    }
  }

  /* --------------------------------------------------------------- Reagan */

  /** The whoop. A rising yip that sounds like a man, not an instrument. */
  whoop(): void {
    if (!this.ctx || !this.master) return
    const at = this.now
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(240, at)
    osc.frequency.exponentialRampToValueAtTime(620, at + 0.14)
    osc.frequency.exponentialRampToValueAtTime(400, at + 0.34)
    filter.type = 'bandpass'
    filter.Q.value = 5
    filter.frequency.setValueAtTime(900, at)
    filter.frequency.linearRampToValueAtTime(1700, at + 0.3)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    this.env(gain, 0.22, 0.04, 0.36, at)
    osc.start(at)
    osc.stop(at + 0.45)
  }

  /** The stun rifle: a short electric zap, not a gunshot. Nothing dies here. */
  stunShot(): void {
    this.tone('square', 1500, 0.11, 0.005, 0.1, { to: 260, filter: 4200 })
    this.burst(0.05, 0.09, 5200, 700, 'bandpass')
  }

  hit(headshot: boolean): void {
    this.tone('sine', headshot ? 720 : 420, 0.14, 0.005, 0.14, { to: headshot ? 300 : 180 })
  }

  goad(connected: boolean): void {
    this.burst(0.1, 0.16, 2600, 400)
    if (connected) this.tone('sine', 130, 0.18, 0.006, 0.22, { to: 62 })
  }

  jump(): void {
    this.tone('sine', 300, 0.07, 0.006, 0.12, { to: 480 })
  }

  land(hard: boolean): void {
    this.burst(hard ? 0.16 : 0.07, hard ? 0.22 : 0.11, 900, 120)
  }

  /* ------------------------------------------------------------ threats */

  /** Filtered noise plus a descending sawtooth. Big, but not frightening. */
  roar(big = false): void {
    const at = this.now
    this.burst(big ? 0.3 : 0.2, big ? 1.1 : 0.75, big ? 900 : 1400, 150, 'lowpass', at)
    this.tone('sawtooth', big ? 130 : 190, big ? 0.22 : 0.15, 0.08, big ? 0.95 : 0.62, {
      to: big ? 42 : 66,
      filter: 700,
      at,
    })
  }

  /** Comedy, not carnage: the descending flop of something going to sleep. */
  predatorDown(): void {
    const at = this.now
    this.tone('sawtooth', 300, 0.16, 0.03, 0.5, { to: 70, filter: 900, at })
    this.burst(0.14, 0.3, 700, 90, 'lowpass', at + 0.12)
    // A little snore, so it is clear nothing has been killed.
    this.tone('triangle', 90, 0.07, 0.25, 0.5, { to: 130, at: at + 0.6 })
  }

  thunder(): void {
    this.burst(0.38, 1.9, 2400, 60)
    this.tone('sine', 46, 0.2, 0.15, 1.6, { to: 26 })
  }

  klaxon(): void {
    const at = this.now
    for (let i = 0; i < 2; i++) {
      this.tone('square', 520, 0.13, 0.02, 0.2, { to: 380, filter: 1600, at: at + i * 0.26 })
    }
  }

  /* ------------------------------------------------------------- rewards */

  /** "A pleasant two-note chime per head delivered." */
  delivered(prime: boolean): void {
    const at = this.now
    this.tone('sine', 660, 0.16, 0.01, 0.28, { at })
    this.tone('sine', prime ? 990 : 880, 0.16, 0.01, 0.42, { at: at + 0.11 })
  }

  headLost(): void {
    const at = this.now
    this.tone('triangle', 300, 0.14, 0.02, 0.4, { to: 150, at })
    this.tone('triangle', 200, 0.12, 0.02, 0.6, { to: 90, at: at + 0.16 })
  }

  beacon(): void {
    const at = this.now
    this.tone('square', 880, 0.08, 0.01, 0.1, { filter: 2400, at })
    this.tone('square', 1320, 0.08, 0.01, 0.14, { filter: 2400, at: at + 0.09 })
  }

  ui(pitch = 1): void {
    this.tone('square', 620 * pitch, 0.06, 0.005, 0.06, { filter: 2600 })
  }

  /* ------------------------------------------------------------ the sting */

  /**
   * "Spaghetti-western guitar sting on level start via a simple synth
   * arpeggio." Minor triad, plucked, with a slap-back delay standing in for a
   * canyon and a whole tremolo pedal we do not have.
   */
  westernSting(): void {
    if (!this.ctx || !this.master) return
    const at = this.now + 0.05
    // A minor arpeggio walked up and left hanging on the fifth.
    const notes = [146.83, 174.61, 220.0, 293.66, 220.0, 174.61]
    notes.forEach((f, i) => {
      const t = at + i * 0.17
      this.pluck(f, t, i === notes.length - 1 ? 1.6 : 0.5)
      // The canyon slap-back.
      this.pluck(f, t + 0.21, 0.3, 0.35)
    })
    // A single low note underneath, for the desert.
    this.tone('sawtooth', 73.42, 0.1, 0.3, 2.4, { filter: 340, at })
  }

  private pluck(freq: number, at: number, decay: number, level = 1): void {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(2600, at)
    filter.frequency.exponentialRampToValueAtTime(420, at + decay)
    filter.Q.value = 3
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    this.env(gain, 0.17 * level, 0.008, decay, at)
    osc.start(at)
    osc.stop(at + decay + 0.1)
  }

  /** Two flat corporate blips, for anything Trans-Time says. */
  corporate(): void {
    const at = this.now
    this.tone('square', 740, 0.07, 0.006, 0.08, { filter: 2200, at })
    this.tone('square', 740, 0.07, 0.006, 0.12, { filter: 2200, at: at + 0.13 })
  }
}

export const audio = new AudioEngine()
