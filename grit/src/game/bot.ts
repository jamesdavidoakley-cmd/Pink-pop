/**
 * A careful driver, written down.
 *
 * This is not an opponent and it never appears in the game. It exists so the
 * test suite can prove that every level is beatable by someone who has
 * understood the physics — feather the throttle so demand stays under the grit
 * line, slow down before a bend rather than in it, and start braking early
 * enough for the weight you are carrying.
 *
 * If the bot cannot finish a level, a six year old certainly cannot.
 */

import { BRAKE_MAX_FORCE, G, type TyreId, type Zone } from '../physics/constants'
import {
  computeBudget,
  emptyDriveState,
  loadOnBrake,
  step,
  stickiness,
  totalMass,
  type Conditions,
  type Crate,
  type DriveState,
  type Rig,
} from '../physics/model'
import { sampleTrack, trackLength } from '../physics/track'
import type { Level, RunSpec } from './levels'

export interface BotOptions {
  tyres?: TyreId
  liftAxle?: boolean
  wheelWeights?: boolean
  sand?: boolean
  maxSeconds?: number
}

export interface BotResult {
  finished: boolean
  reason: 'arrived' | 'stopped-on-mark' | 'timeout' | 'stuck'
  seconds: number
  wheelspinFrames: number
  distance: number
  topSpeed: number
}

const DT = 1 / 60

/** The fastest this corner can be taken with a bit in hand. */
const cornerSpeed = (mu: number, radius: number): number => Math.sqrt(0.5 * mu * G * radius)

export function driveLevel(
  level: Level,
  run: RunSpec,
  placement: Record<string, Zone>,
  options: BotOptions = {},
): BotResult {
  const crates: Crate[] = run.crates.map((c) => ({
    id: c.id,
    mass: c.mass,
    kind: c.kind,
    zone: placement[c.id] ?? 'middle',
    secured: c.secured ?? true,
  }))

  const rig: Rig = {
    crates,
    tyres: options.tyres ?? 'road',
    wheelWeights: options.wheelWeights ?? false,
    liftAxleRaised: options.liftAxle ?? false,
    ballastKg: 0,
    mudOnCabKg: 0,
  }

  const track = level.track
  const finishAt = trackLength(track) - 2
  const maxSeconds = options.maxSeconds ?? 180
  const mass = totalMass(rig)

  let state: DriveState = emptyDriveState()
  let seconds = 0
  let wheelspinFrames = 0
  let topSpeed = 0
  let stalledFor = 0
  let sandLeft = options.sand ? 3 : 0
  let sandTimer = 0

  while (seconds < maxSeconds) {
    const point = sampleTrack(track, state.s)
    sandTimer = Math.max(0, sandTimer - DT)

    const cond: Conditions = {
      surface: point.surface,
      slope: point.slope,
      bendRadius: point.bendRadius,
      sandActive: sandTimer > 0,
      onBoards: false,
    }

    // --- how fast do we want to be going? --------------------------------
    let targetSpeed = 30

    // Bends coming up within the next stretch of road.
    for (let ahead = 0; ahead <= 30; ahead += 5) {
      const p = sampleTrack(track, state.s + ahead)
      if (p.bendRadius) {
        const mu = stickiness(rig, { ...cond, surface: p.surface }, false)
        targetSpeed = Math.min(targetSpeed, cornerSpeed(mu, p.bendRadius) + ahead * 0.12)
      }
    }

    // A mark to stop on.
    let brake = 0
    if (run.markAt !== undefined) {
      const remaining = run.markAt - state.s
      const mu = stickiness(rig, cond, false)
      const brakeGrip = mu * loadOnBrake(rig, cond, BRAKE_MAX_FORCE / mass) * G
      const maxDecel = Math.max(0.5, Math.min(BRAKE_MAX_FORCE, brakeGrip) / mass)
      const needed = remaining > 0.4 ? (state.v * state.v) / (2 * Math.max(0.4, remaining - 1.5)) : 99
      if (needed > maxDecel * 0.55) brake = 1
      if (remaining < 0.4) brake = 1
      // Do not build speed we will only have to lose again.
      targetSpeed = Math.min(targetSpeed, Math.sqrt(Math.max(0, 2 * maxDecel * 0.5 * Math.max(0, remaining - 2))) + 1.5)
    }

    // --- how much thumb? --------------------------------------------------
    let throttle = 0
    if (brake === 0 && state.v < targetSpeed) {
      for (let t = 1; t >= 0.0001; t -= 0.05) {
        const b = computeBudget(rig, cond, { throttle: t, brake: 0 }, state)
        if (b.demand <= b.gripAvailable * 0.92) {
          throttle = t
          break
        }
      }
    }

    // Already spinning: come right off and let it hook up again.
    if (state.isSlipping) {
      throttle = Math.min(throttle, 0.12)
      if (sandLeft > 0 && sandTimer <= 0 && state.v < 2) {
        sandLeft--
        sandTimer = 3.5
      }
    }

    const result = step(state, rig, cond, { throttle, brake }, DT)
    state = result.state
    if (state.isSlipping) wheelspinFrames++
    topSpeed = Math.max(topSpeed, state.v)
    seconds += DT

    if (Math.abs(state.v) < 0.08 && throttle > 0.02) stalledFor += DT
    else stalledFor = 0

    if (run.markAt !== undefined) {
      const tol = run.markTolerance ?? 7
      if (Math.abs(state.s - run.markAt) <= tol && Math.abs(state.v) < 0.15) {
        return {
          finished: true,
          reason: 'stopped-on-mark',
          seconds,
          wheelspinFrames,
          distance: state.s,
          topSpeed,
        }
      }
      // Sailed past the box entirely.
      if (state.s > run.markAt + tol + 12) break
    } else if (state.s >= finishAt) {
      return { finished: true, reason: 'arrived', seconds, wheelspinFrames, distance: state.s, topSpeed }
    }

    if (stalledFor > 6) {
      return { finished: false, reason: 'stuck', seconds, wheelspinFrames, distance: state.s, topSpeed }
    }
  }

  return { finished: false, reason: 'timeout', seconds, wheelspinFrames, distance: state.s, topSpeed }
}

export const ZONE_CHOICES: Zone[] = ['over_cab', 'middle', 'over_rear_axle']

/** Every way the crates could be arranged on the bed. */
export function allPlacements(ids: string[]): Record<string, Zone>[] {
  if (ids.length === 0) return [{}]
  const [head, ...rest] = ids
  const tails = allPlacements(rest)
  const out: Record<string, Zone>[] = []
  for (const zone of ZONE_CHOICES) {
    for (const tail of tails) out.push({ ...tail, [head as string]: zone })
  }
  return out
}
