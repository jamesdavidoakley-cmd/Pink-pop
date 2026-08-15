/**
 * All the sound, synthesised. No audio files, so the game works offline and
 * loads instantly.
 *
 * The important one is the engine note: it climbs with the throttle, and the
 * instant a wheel lets go it breaks into a thin high whine while the low end
 * falls out from under it. That cue does more teaching than any words could,
 * so it gets the most care here.
 */

type Voice = {
  osc: OscillatorNode
  gain: GainNode
}

export class GritAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null

  private lump: Voice | null = null
  private body: Voice | null = null
  private engineFilter: BiquadFilterNode | null = null
  private engineGain: GainNode | null = null

  private whine: Voice | null = null
  private scrub: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null =
    null

  private noiseBuffer: AudioBuffer | null = null
  private running = false
  enabled = true

  /** Must be called from inside a real touch or click. */
  start(): void {
    if (this.running) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    try {
      const ctx = new Ctor()
      this.ctx = ctx
      const master = ctx.createGain()
      master.gain.value = this.enabled ? 0.85 : 0
      master.connect(ctx.destination)
      this.master = master

      // A pre-made second of white noise, reused for everything gritty.
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer

      // --- engine: a slow lumpy fundamental plus a reedier body -----------
      const engineGain = ctx.createGain()
      engineGain.gain.value = 0
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 400
      filter.Q.value = 3
      filter.connect(engineGain)
      engineGain.connect(master)
      this.engineFilter = filter
      this.engineGain = engineGain

      this.lump = this.makeVoice(ctx, 'sawtooth', 46, 0.55, filter)
      this.body = this.makeVoice(ctx, 'square', 92, 0.16, filter)

      // --- the wheelspin whine --------------------------------------------
      const whineGain = ctx.createGain()
      whineGain.gain.value = 0
      whineGain.connect(master)
      const whineOsc = ctx.createOscillator()
      whineOsc.type = 'triangle'
      whineOsc.frequency.value = 1500
      whineOsc.connect(whineGain)
      whineOsc.start()
      this.whine = { osc: whineOsc, gain: whineGain }

      // --- tyre scrub, for spinning and skidding ---------------------------
      const scrubGain = ctx.createGain()
      scrubGain.gain.value = 0
      scrubGain.connect(master)
      const scrubFilter = ctx.createBiquadFilter()
      scrubFilter.type = 'bandpass'
      scrubFilter.frequency.value = 1800
      scrubFilter.Q.value = 0.9
      scrubFilter.connect(scrubGain)
      const scrubSource = ctx.createBufferSource()
      scrubSource.buffer = buffer
      scrubSource.loop = true
      scrubSource.connect(scrubFilter)
      scrubSource.start()
      this.scrub = { source: scrubSource, filter: scrubFilter, gain: scrubGain }

      this.running = true
    } catch {
      this.running = false
    }
  }

  private makeVoice(
    ctx: AudioContext,
    type: OscillatorType,
    freq: number,
    level: number,
    dest: AudioNode,
  ): Voice {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.value = level
    osc.connect(gain)
    gain.connect(dest)
    osc.start()
    return { osc, gain }
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05)
    }
  }

  resume(): void {
    void this.ctx?.resume()
  }

  /** Called every frame from the drive loop. */
  setEngine(throttle: number, speed: number, slipping: boolean, spin: number, idle = true): void {
    if (!this.running || !this.ctx) return
    const t = this.ctx.currentTime

    // Under wheelspin the engine races: the wheel is turning much faster than
    // the road, so the note climbs even though the lorry is going nowhere.
    const revs = speed * 3.2 + throttle * 26 + (slipping ? spin * 46 : 0)
    const fundamental = 38 + revs
    const load = idle ? 0.35 + throttle * 0.65 : 0

    this.lump?.osc.frequency.setTargetAtTime(fundamental, t, 0.05)
    this.body?.osc.frequency.setTargetAtTime(fundamental * 2.02, t, 0.05)
    this.engineFilter?.frequency.setTargetAtTime(
      280 + throttle * 1500 + (slipping ? 1400 : 0),
      t,
      0.04,
    )
    this.engineGain?.gain.setTargetAtTime(load * 0.34, t, 0.06)

    // The thin whine only exists while a wheel is spinning.
    if (this.whine) {
      this.whine.osc.frequency.setTargetAtTime(1250 + spin * 1700 + throttle * 250, t, 0.03)
      this.whine.gain.gain.setTargetAtTime(slipping ? 0.055 + spin * 0.05 : 0, t, 0.04)
    }
    if (this.scrub) {
      this.scrub.filter.frequency.setTargetAtTime(1400 + spin * 1200, t, 0.05)
      this.scrub.gain.gain.setTargetAtTime(slipping ? 0.05 + spin * 0.07 : 0, t, 0.06)
    }
  }

  /** Everything quiet, for the screens that are not the drive screen. */
  silenceEngine(): void {
    if (!this.running || !this.ctx) return
    const t = this.ctx.currentTime
    this.engineGain?.gain.setTargetAtTime(0, t, 0.08)
    this.whine?.gain.gain.setTargetAtTime(0, t, 0.08)
    this.scrub?.gain.gain.setTargetAtTime(0, t, 0.08)
  }

  private burst(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    level: number,
  ): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freqStart, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(level, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  }

  private noise(duration: number, freq: number, level: number, type: BiquadFilterType = 'lowpass'): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(level, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + duration + 0.02)
  }

  /** The lovely low clunk of a tyre finding grip again. */
  thunk(): void {
    this.burst(110, 42, 0.22, 'sine', 0.4)
    this.noise(0.12, 420, 0.18)
  }

  /** A wheel letting go. */
  slipStart(): void {
    this.noise(0.18, 2600, 0.12, 'bandpass')
  }

  tap(): void {
    this.burst(660, 620, 0.06, 'square', 0.06)
  }

  chime(step = 0): void {
    const notes = [523, 659, 784, 1047]
    this.burst(notes[step % notes.length]!, notes[step % notes.length]! * 1.001, 0.28, 'triangle', 0.16)
  }

  clunk(): void {
    this.burst(180, 90, 0.14, 'square', 0.14)
  }

  /** Cargo hitting the deck. */
  tumble(): void {
    this.noise(0.35, 700, 0.24)
    this.burst(150, 60, 0.3, 'sawtooth', 0.12)
  }

  horn(kind: string): void {
    if (!this.ctx || !this.master) return
    const pairs: Record<string, number[]> = {
      airhorn: [330, 415],
      klaxon: [262, 330],
      trumpet: [392, 494, 587],
      none: [],
    }
    const notes = pairs[kind] ?? []
    for (const n of notes) this.burst(n, n * 0.995, 0.7, 'sawtooth', 0.1)
  }
}

export const audio = new GritAudio()
