/**
 * The drive screen's brain: one fixed-step simulation that owns the lorry, the
 * road, the weather the bosses make, the particles and the scoring.
 *
 * Deliberately not React state — it ticks at 60fps and hands the UI a snapshot
 * when the UI asks for one.
 */

import {
  BALLAST_MAX,
  BOARD_LENGTH,
  SAND_DURATION,
  MID_AXLE_SHARE,
  type SurfaceId,
  type Zone,
} from '../physics/constants'
import {
  computeBudget,
  emptyDriveState,
  step,
  totalMass,
  type Budget,
  type Conditions,
  type Crate,
  type DriveState,
  type Inputs,
  type Rig,
} from '../physics/model'
import { sampleTrack, trackLength, type SurfacePatch } from '../physics/track'
import type { Level, RunSpec } from './levels'

export type Outcome = 'running' | 'delivered' | 'parked' | 'overshot' | 'gave-up'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  colour: string
  gravity: number
}

export interface DriveStats {
  seconds: number
  wheelspinSeconds: number
  hadWheelspin: boolean
  cargoLost: number
  sandUsed: number
  boardsUsed: number
  /** How close to the mark the lorry came to rest, in metres. */
  markError: number | null
  everRecovered: boolean
  easedOffToRecover: boolean
  slowedForBend: boolean
  usedLiftAxle: boolean
  movedLoadRearward: boolean
  shedBallast: boolean
}

export interface BossState {
  kind: 'slick' | 'mudzilla' | null
  phase: number
  /** Where the creature is along the track, in metres. */
  position: number
  /** 0..1, how much of the fight is behind you. Never shown as a number. */
  progress: number
  mood: 'calm' | 'cross' | 'beaten'
  /** Counts down to the next mischief. */
  nextAction: number
  wobble: number
}

export interface SimOptions {
  sandRefills: number
  boardsAvailable: number
  hasLiftAxle: boolean
  hasBallast: boolean
  hasSand: boolean
  hasBoards: boolean
  reducedMotion: boolean
}

const DT = 1 / 60

const SURFACE_SPRAY: Record<SurfaceId, string> = {
  dry_tarmac: '#8C8577',
  wet_tarmac: '#6E7A86',
  gravel: '#B4AC9C',
  wet_leaves: '#6E5A32',
  mud: '#8A5A2B',
  snow: '#EDF2F4',
  ice: '#BFE3EF',
}

export class DriveSim {
  state: DriveState = emptyDriveState()
  rig: Rig
  budget: Budget
  patches: SurfacePatch[] = []
  particles: Particle[] = []
  outcome: Outcome = 'running'
  boss: BossState
  stats: DriveStats = {
    seconds: 0,
    wheelspinSeconds: 0,
    hadWheelspin: false,
    cargoLost: 0,
    sandUsed: 0,
    boardsUsed: 0,
    markError: null,
    everRecovered: false,
    easedOffToRecover: false,
    slowedForBend: false,
    usedLiftAxle: false,
    movedLoadRearward: false,
    shedBallast: false,
  }

  sandTimer = 0
  sandLeft: number
  boardsLeft: number
  /** Where boards are lying on the road, so the wheel can find them. */
  boardPositions: number[] = []
  cabMud = 0
  ballastTarget = 0

  /** Set for one frame when something worth hearing happens. */
  events: string[] = []

  readonly level: Level
  readonly run: RunSpec
  readonly options: SimOptions
  readonly finishAt: number

  private stillFor = 0
  private throttleAtSlipStart = 0
  private speedBeforeBend = 0

  constructor(level: Level, run: RunSpec, rig: Rig, options: SimOptions) {
    this.level = level
    this.run = run
    this.rig = rig
    this.options = options
    this.sandLeft = options.hasSand ? options.sandRefills : 0
    this.boardsLeft = options.hasBoards ? options.boardsAvailable : 0
    this.ballastTarget = rig.ballastKg
    this.finishAt = trackLength(level.track) - 2
    this.boss = {
      kind: level.objective === 'boss-slick' ? 'slick' : level.objective === 'boss-mudzilla' ? 'mudzilla' : null,
      phase: 1,
      position: 60,
      progress: 0,
      mood: 'calm',
      nextAction: 3,
      wobble: 0,
    }
    this.budget = computeBudget(rig, this.conditionsAt(0), { throttle: 0, brake: 0 }, this.state)
  }

  conditionsAt(s: number): Conditions {
    const point = sampleTrack(this.level.track, s, this.patches)
    const onBoards = this.boardPositions.some((p) => s >= p && s <= p + BOARD_LENGTH)
    return {
      surface: point.surface,
      slope: point.slope,
      bendRadius: point.bendRadius,
      sandActive: this.sandTimer > 0,
      onBoards,
    }
  }

  get surface(): SurfaceId {
    return sampleTrack(this.level.track, this.state.s, this.patches).surface
  }

  // ---- player actions ----------------------------------------------------

  dropSand(): boolean {
    if (this.sandLeft <= 0) return false
    this.sandLeft--
    this.sandTimer = SAND_DURATION
    this.stats.sandUsed++
    this.events.push('sand')
    this.spawnParticles(10, '#D8C9A3', -0.6, 26)
    return true
  }

  placeBoards(): boolean {
    if (this.boardsLeft <= 0 || Math.abs(this.state.v) > 1.2) return false
    this.boardsLeft--
    this.stats.boardsUsed++
    this.boardPositions.push(this.state.s - 0.5)
    this.events.push('boards')
    return true
  }

  toggleLiftAxle(): void {
    if (!this.options.hasLiftAxle) return
    this.rig.liftAxleRaised = !this.rig.liftAxleRaised
    if (this.rig.liftAxleRaised) this.stats.usedLiftAxle = true
    this.events.push('clunk')
  }

  setBallast(target: number): void {
    if (!this.options.hasBallast) return
    const clamped = Math.max(0, Math.min(BALLAST_MAX, target))
    if (clamped < this.rig.ballastKg) this.stats.shedBallast = true
    this.ballastTarget = clamped
  }

  /** Shift one crate one place towards the back of the bed. Bosses and yard. */
  shiftLoadRearward(): boolean {
    if (Math.abs(this.state.v) > 1.5) return false
    const order: Zone[] = ['over_cab', 'middle', 'over_rear_axle']
    const movable = this.rig.crates
      .filter((c) => c.zone !== null && !c.lost && c.zone !== 'over_rear_axle')
      .sort((a, b) => order.indexOf(a.zone as Zone) - order.indexOf(b.zone as Zone))
    const crate = movable[0]
    if (!crate) return false
    crate.zone = crate.zone === 'over_cab' ? 'middle' : 'over_rear_axle'
    this.stats.movedLoadRearward = true
    this.events.push('clunk')
    return true
  }

  shovelCab(): boolean {
    if (this.cabMud <= 0) return false
    this.cabMud = Math.max(0, this.cabMud - 140)
    this.rig.mudOnCabKg = this.cabMud
    this.events.push('shovel')
    this.spawnParticles(8, '#8A5A2B', 2.6, 40)
    return true
  }

  // ---- the tick ----------------------------------------------------------

  update(inputs: Inputs): void {
    this.events = []
    if (this.outcome !== 'running') {
      this.updateParticles()
      return
    }

    this.stats.seconds += DT
    this.sandTimer = Math.max(0, this.sandTimer - DT)

    // Ballast moves at a believable rate rather than teleporting.
    if (this.rig.ballastKg !== this.ballastTarget) {
      const rate = 420 * DT
      const diff = this.ballastTarget - this.rig.ballastKg
      this.rig.ballastKg += Math.max(-rate, Math.min(rate, diff))
      if (Math.abs(this.ballastTarget - this.rig.ballastKg) < 1) {
        this.rig.ballastKg = this.ballastTarget
      }
    }

    this.updateBoss()

    const cond = this.conditionsAt(this.state.s)
    const before = this.state
    const result = step(before, this.rig, cond, inputs, DT)
    this.state = result.state
    this.budget = result.budget

    // Boards under the wheel are consumed by rolling over them.
    this.boardPositions = this.boardPositions.filter((p) => this.state.s < p + BOARD_LENGTH + 20)

    for (const event of result.events) {
      if (event.type === 'slip-start') {
        this.stats.hadWheelspin = true
        this.throttleAtSlipStart = inputs.throttle
        this.events.push('slip-start')
      }
      if (event.type === 'slip-end') {
        this.stats.everRecovered = true
        // Did they get it back by lifting off, or did the road simply improve?
        if (inputs.throttle < this.throttleAtSlipStart - 0.12) this.stats.easedOffToRecover = true
        this.events.push('slip-end')
      }
      if (event.type === 'verge') this.events.push('verge')
      if (event.type === 'skid-start') this.events.push('skid-start')
    }

    if (this.state.isSlipping) this.stats.wheelspinSeconds += DT

    this.trackBendBehaviour(cond)
    this.shuffleCargo(this.budget.accel)
    this.spawnDriveParticles(cond)
    this.updateParticles()
    this.checkOutcome()
  }

  private trackBendBehaviour(cond: Conditions): void {
    // Did they come off the power before the corner rather than in it?
    const ahead = sampleTrack(this.level.track, this.state.s + 18, this.patches)
    if (ahead.bendRadius && !cond.bendRadius) {
      this.speedBeforeBend = Math.max(this.speedBeforeBend, this.state.v)
    }
    if (cond.bendRadius && this.speedBeforeBend > 3 && this.state.v < this.speedBeforeBend * 0.82) {
      this.stats.slowedForBend = true
      this.speedBeforeBend = 0
    }
  }

  private shuffleCargo(accel: number): void {
    const order: Zone[] = ['over_cab', 'middle', 'over_rear_axle']
    for (const crate of this.rig.crates) {
      if (crate.secured || crate.zone === null || crate.lost) continue
      const index = order.indexOf(crate.zone)

      // Hard braking throws it forward.
      if (accel < -3.2 && index > 0) {
        crate.zone = order[index - 1] as Zone
        this.events.push('slide')
        this.spawnParticles(6, '#C9C3B6', 0, 30)
      }
      // Hard acceleration walks it backwards, and off the end if it runs out
      // of bed. Comic, not punishing: you simply arrive with less.
      if (accel > 2.6 && index < order.length - 1) {
        crate.zone = order[index + 1] as Zone
        this.events.push('slide')
      } else if (accel > 3.4 && index === order.length - 1) {
        crate.lost = true
        this.stats.cargoLost++
        this.events.push('tumble')
        this.spawnParticles(16, '#8A5A2B', -3.4, 70)
      }
    }
  }

  // ---- bosses ------------------------------------------------------------

  private updateBoss(): void {
    const boss = this.boss
    if (!boss.kind) return

    boss.wobble += DT
    boss.nextAction -= DT
    const s = this.state.s
    const length = trackLength(this.level.track)
    boss.progress = Math.max(0, Math.min(1, s / this.finishAt))

    if (boss.kind === 'slick') {
      // Slick keeps just ahead, freezing what is in front of you.
      boss.position = Math.min(length - 6, s + 42 + Math.sin(boss.wobble * 0.8) * 8)
      boss.phase = s < 120 ? 1 : s < 200 ? 2 : 3
      boss.mood = boss.progress > 0.9 ? 'beaten' : boss.phase >= 2 ? 'cross' : 'calm'

      if (boss.nextAction <= 0) {
        if (boss.phase === 1) {
          // Patches to feather across.
          this.patches.push({ from: boss.position, to: boss.position + 12, surface: 'ice' })
          boss.nextAction = 3.4
        } else if (boss.phase === 2) {
          // A full sheet: this is what the sand is for.
          this.patches.push({ from: boss.position - 20, to: boss.position + 40, surface: 'ice' })
          boss.nextAction = 2.6
        } else {
          this.patches.push({ from: boss.position - 10, to: boss.position + 30, surface: 'ice' })
          boss.nextAction = 3.2
        }
        this.events.push('slick-hiss')
      }
      // Old ice thaws behind you so the road is never a solid block of it.
      this.patches = this.patches.filter((p) => p.to > s - 30)
    }

    if (boss.kind === 'mudzilla') {
      boss.position = Math.min(length - 10, Math.max(s + 30, 90))
      boss.phase = s < 120 ? 1 : s < 210 ? 2 : 3
      boss.mood = boss.progress > 0.92 ? 'beaten' : boss.phase >= 2 ? 'cross' : 'calm'

      if (boss.nextAction <= 0 && boss.phase < 3) {
        // Mud on the front of the lorry: it drags the press off the back.
        this.cabMud = Math.min(1400, this.cabMud + (boss.phase === 1 ? 150 : 230))
        this.rig.mudOnCabKg = this.cabMud
        this.patches.push({ from: s + 14, to: s + 30, surface: 'mud' })
        this.events.push('mud-splat')
        this.spawnParticles(18, '#5E3D1C', 3.4, 90)
        boss.nextAction = boss.phase === 1 ? 6 : 4.2
      }
      this.patches = this.patches.filter((p) => p.to > s - 30)
    }
  }

  // ---- particles ---------------------------------------------------------

  private spawnParticles(count: number, colour: string, offsetM: number, speed: number): void {
    if (this.options.reducedMotion) return
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: this.state.s + offsetM + (Math.random() - 0.5) * 0.6,
        y: -0.1 - Math.random() * 0.3,
        vx: -(Math.random() * speed) / 30,
        vy: -(Math.random() * speed) / 26,
        life: 0.5 + Math.random() * 0.6,
        maxLife: 1.1,
        size: 2 + Math.random() * 4,
        colour,
        gravity: 9,
      })
    }
  }

  private spawnDriveParticles(cond: Conditions): void {
    if (this.options.reducedMotion) return
    const colour = SURFACE_SPRAY[cond.surface]

    // The rooster tail. Bigger the faster the wheel is spinning.
    if (this.state.isSlipping && this.particles.length < 260) {
      const n = 1 + Math.round(this.state.spin * 3)
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: this.state.s - 3.0,
          y: -0.05,
          vx: -(2 + Math.random() * 7) * (0.4 + this.state.spin),
          vy: -(1.5 + Math.random() * 6) * (0.4 + this.state.spin),
          life: 0.45 + Math.random() * 0.55,
          maxLife: 1,
          size: 2 + Math.random() * 4.5,
          colour,
          gravity: 11,
        })
      }
    }

    // A quiet bit of dust when simply rolling along on a loose surface.
    const loose = cond.surface === 'gravel' || cond.surface === 'mud' || cond.surface === 'snow'
    if (loose && Math.abs(this.state.v) > 3 && Math.random() < 0.4 && this.particles.length < 260) {
      this.particles.push({
        x: this.state.s - 3.0,
        y: -0.05,
        vx: -(0.5 + Math.random() * 2),
        vy: -(0.4 + Math.random() * 1.6),
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
        size: 1.5 + Math.random() * 3,
        colour,
        gravity: 5,
      })
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      p.life -= DT
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      p.x += p.vx * DT
      p.y += p.vy * DT
      p.vy += p.gravity * DT
      if (p.y > 0) {
        p.y = 0
        p.vy *= -0.28
        p.vx *= 0.7
      }
    }
  }

  // ---- finishing ---------------------------------------------------------

  private checkOutcome(): void {
    const stopped = Math.abs(this.state.v) < 0.12
    if (stopped) this.stillFor += DT
    else this.stillFor = 0

    if (this.run.markAt !== undefined) {
      const tol = this.run.markTolerance ?? 7
      const error = this.state.s - this.run.markAt
      if (stopped && this.stillFor > 0.55) {
        this.stats.markError = error
        this.outcome = Math.abs(error) <= tol ? 'parked' : 'overshot'
      } else if (this.state.s > this.run.markAt + tol + 25) {
        this.stats.markError = error
        this.outcome = 'overshot'
      }
      return
    }

    if (this.state.s >= this.finishAt) {
      this.outcome = 'delivered'
      if (this.boss.kind) this.boss.mood = 'beaten'
    }
  }

  /** The last 40-metre post the lorry rolled past, for instant retries. */
  get checkpoint(): number {
    return Math.max(0, Math.floor(this.state.s / 40) * 40 - (this.outcome === 'overshot' ? 40 : 0))
  }

  /**
   * Put the lorry back on the road at a checkpoint with everything it started
   * with. There is no game over in this game, only another go.
   */
  resetTo(s: number, crates: Crate[]): void {
    this.state = { ...emptyDriveState(), s: Math.max(0, s) }
    this.rig.crates = crates
    this.rig.mudOnCabKg = 0
    this.cabMud = 0
    this.patches = []
    this.particles = []
    this.boardPositions = []
    this.outcome = 'running'
    this.sandTimer = 0
    this.sandLeft = this.options.hasSand ? this.options.sandRefills : 0
    this.boardsLeft = this.options.hasBoards ? this.options.boardsAvailable : 0
    this.stillFor = 0
    this.boss = {
      ...this.boss,
      phase: 1,
      progress: 0,
      mood: 'calm',
      nextAction: 3,
    }
    // Retrying keeps the achievements you had already earned honest: a run you
    // restarted is no longer a clean run.
    this.stats = {
      ...this.stats,
      markError: null,
    }
    this.budget = computeBudget(this.rig, this.conditionsAt(this.state.s), { throttle: 0, brake: 0 }, this.state)
  }

  /** Everything the HUD needs, gathered once per frame. */
  snapshot() {
    return {
      grip: this.budget.gripFraction,
      demand: this.budget.demandFraction,
      slipping: this.state.isSlipping,
    }
  }

  get pressFraction(): number {
    // For the "press on the driving wheels" bar: the drive axle's share of a
    // sensible maximum, so it reads as a picture of how loaded the back is.
    const max = 6200
    return Math.max(0, Math.min(1, this.budget.loadOnDrive / max))
  }

  get massFraction(): number {
    return Math.max(0, Math.min(1, totalMass(this.rig) / 12000))
  }

  get liftAxleShare(): number {
    return MID_AXLE_SHARE
  }

  get cargoOnBoard(): Crate[] {
    return this.rig.crates.filter((c) => c.zone !== null && !c.lost)
  }
}
