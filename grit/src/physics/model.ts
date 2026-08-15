/**
 * GRIT — the model.
 *
 * Deterministic, fixed-step, no physics engine. Every number a child ever sees
 * comes out of this file and gets drawn as a picture somewhere else.
 *
 * The one idea: grip at the driving wheel is stickiness x how hard that wheel
 * is pressed down. You spend it on going, stopping and turning. Overspend and
 * the wheel spins — and a spinning wheel is slipperier still, so the way out is
 * to ease off.
 */

import {
  BALLAST_DRIVE_SHARE,
  BOARD_MU_MULTIPLIER,
  BRAKE_MAX_FORCE,
  CHAINS_SPEED_CAP,
  DRAG_K,
  FRONT_FACTOR,
  G,
  LORRY_FRONT_STATIC,
  LORRY_MASS,
  LORRY_REAR_STATIC,
  MAX_ACCEL,
  METER_REFERENCE_FORCE,
  MID_AXLE_SHARE,
  MU_SURFACE,
  PLACEMENT_FACTOR,
  RECOVER_RATIO,
  ROLLING_RESISTANCE,
  SAND_BONUS,
  SLIP_MU_FACTOR,
  TRANSFER_K,
  TYRE_MULTIPLIER,
  V_MAX_ENGINE,
  WHEEL_WEIGHTS_KG,
  type SurfaceId,
  type TyreId,
  type Zone,
} from './constants'

export type CrateKind = 'brick' | 'sand' | 'pipe' | 'hay' | 'barrel' | 'log'

export interface Crate {
  id: string
  mass: number
  kind: CrateKind
  /** null while it is still sitting in the yard, unloaded. */
  zone: Zone | null
  /** Unsecured cargo shuffles about under hard braking and can tumble off. */
  secured: boolean
  /** Set once it has fallen off the back; it stops counting for anything. */
  lost?: boolean
}

export interface Rig {
  crates: Crate[]
  tyres: TyreId
  wheelWeights: boolean
  liftAxleRaised: boolean
  ballastKg: number
  /** Mudzilla's contribution: mud that has landed on the front of the lorry. */
  mudOnCabKg: number
}

export interface Conditions {
  surface: SurfaceId
  /** Radians. Positive is a climb. */
  slope: number
  /** Metres. null on a straight. */
  bendRadius: number | null
  sandActive: boolean
  onBoards: boolean
}

export interface Inputs {
  /** 0..1, how hard the thumb is pressing. */
  throttle: number
  /** 0..1. */
  brake: number
}

export interface DriveState {
  /** Distance travelled along the track, metres. */
  s: number
  /** Speed, m/s. */
  v: number
  /** How far the lorry has drifted towards the outside of the road, metres. */
  lat: number
  latV: number
  isSlipping: boolean
  isSkidding: boolean
  /** 0..1 — how much faster the wheel is turning than the road is passing. */
  spin: number
  /** Radians; drives the wheel graphic. */
  wheelAngle: number
  /** Metres of recovery board still under the wheel. */
  boardsLeft: number
}

/** Everything the meter, the HUD and the grown-up overlay need to draw a frame. */
export interface Budget {
  /** Stickiness actually in play this frame, slip penalty included. */
  mu: number
  /** Stickiness that would apply if the wheel were gripping. */
  muGripping: number
  muSurface: number
  totalMass: number
  loadOnDrive: number
  gripAvailable: number
  demand: number
  demandDrive: number
  demandSlope: number
  demandLateral: number
  loadOnBrake: number
  gripBrake: number
  brakeForce: number
  tractiveForce: number
  requestedAccel: number
  /** Signed longitudinal acceleration actually achieved, m/s^2. */
  accel: number
  /** 0..1-ish for the meter; can exceed 1 when demand overruns the grit line. */
  gripFraction: number
  demandFraction: number
}

export interface PhysEvent {
  type: 'slip-start' | 'slip-end' | 'skid-start' | 'skid-end' | 'verge' | 'boards-used'
}

export const emptyDriveState = (): DriveState => ({
  s: 0,
  v: 0,
  lat: 0,
  latV: 0,
  isSlipping: false,
  isSkidding: false,
  spin: 0,
  wheelAngle: 0,
  boardsLeft: 0,
})

/** Cargo actually on the bed, ignoring anything lost off the back. */
export const loadedCrates = (rig: Rig): Crate[] =>
  rig.crates.filter((c) => c.zone !== null && !c.lost)

export const cargoMass = (rig: Rig): number =>
  loadedCrates(rig).reduce((sum, c) => sum + c.mass, 0)

export const totalMass = (rig: Rig): number =>
  LORRY_MASS +
  cargoMass(rig) +
  (rig.wheelWeights ? WHEEL_WEIGHTS_KG : 0) +
  rig.ballastKg +
  rig.mudOnCabKg

/**
 * Stickiness. Surface x tyres x sand, and then halved-ish again if the wheel is
 * already sliding — which is why flooring it never works.
 */
export function stickiness(rig: Rig, cond: Conditions, isSlipping: boolean): number {
  const base = MU_SURFACE[cond.surface]
  const tyre = TYRE_MULTIPLIER[rig.tyres][cond.surface]
  let mu = base * tyre
  if (cond.sandActive) mu *= SAND_BONUS
  if (cond.onBoards) mu *= BOARD_MU_MULTIPLIER
  if (isSlipping) mu *= SLIP_MU_FACTOR
  return mu
}

/**
 * How hard the driving wheels are pressed into the ground. Placement is doing
 * most of the work here: the same crate is worth six times as much over the
 * rear axle as it is over the cab.
 */
export function loadOnDrive(rig: Rig, cond: Conditions, requestedAccel: number): number {
  let load = LORRY_REAR_STATIC

  for (const crate of loadedCrates(rig)) {
    load += crate.mass * PLACEMENT_FACTOR[crate.zone as Zone]
  }

  // Mud thrown onto the cab presses on the wrong end entirely.
  load += rig.mudOnCabKg * PLACEMENT_FACTOR.over_cab

  // The lorry squats under acceleration, and a climb leans it back too.
  load += requestedAccel * TRANSFER_K
  load += cond.slope * TRANSFER_K

  if (rig.wheelWeights) load += WHEEL_WEIGHTS_KG
  if (rig.liftAxleRaised) load += MID_AXLE_SHARE
  load += rig.ballastKg * BALLAST_DRIVE_SHARE

  return Math.max(0, load)
}

/** The mirror image, for the brakes: weight that has moved forward. */
export function loadOnBrake(rig: Rig, cond: Conditions, brakeDecel: number): number {
  let load = LORRY_FRONT_STATIC

  for (const crate of loadedCrates(rig)) {
    load += crate.mass * FRONT_FACTOR[crate.zone as Zone]
  }
  load += rig.mudOnCabKg * FRONT_FACTOR.over_cab

  // Dive under braking; a descent leans the weight forward as well.
  load += brakeDecel * TRANSFER_K
  load -= cond.slope * TRANSFER_K

  if (!rig.liftAxleRaised) load += MID_AXLE_SHARE * 0.5
  load += rig.ballastKg * (1 - BALLAST_DRIVE_SHARE)

  return Math.max(0, load)
}

/** Engine pull tails off with speed, so first gear is where you spin. */
export function accelCapacity(rig: Rig, v: number): number {
  const vMax = V_MAX_ENGINE * (rig.tyres === 'chains' ? CHAINS_SPEED_CAP : 1)
  return MAX_ACCEL * Math.max(0, 1 - v / vMax)
}

/**
 * The whole sum for one frame, before anything is integrated. Pure: hand it the
 * same arguments and it hands back the same answer, which is what makes the
 * predict screen honest.
 */
export function computeBudget(
  rig: Rig,
  cond: Conditions,
  inputs: Inputs,
  state: Pick<DriveState, 'v' | 'isSlipping'>,
): Budget {
  const mass = totalMass(rig)
  const mu = stickiness(rig, cond, state.isSlipping)
  const muGripping = stickiness(rig, cond, false)

  const requestedAccel = inputs.throttle * accelCapacity(rig, state.v)
  const load = loadOnDrive(rig, cond, requestedAccel)
  const gripAvailable = mu * load * G

  const demandDrive = mass * requestedAccel
  const demandSlope = mass * G * Math.sin(cond.slope)

  // Turning spends from the same purse. Friction circle: what is left over
  // sideways is whatever the longitudinal demand has not already eaten.
  const demandLateral =
    cond.bendRadius && cond.bendRadius > 0 ? (mass * state.v * state.v) / cond.bendRadius : 0

  // The driving wheel has to push the lorry along *and* hold it against the
  // hill, so both terms are load on the same contact patch. On a descent the
  // hill is helping, and the wheel is asked for nothing.
  const demandLong = demandDrive + demandSlope
  const demand = Math.hypot(Math.max(0, demandLong), demandLateral)

  // Brakes: a fixed-size hammer, further limited by the grip under the front.
  const wantedBrakeForce = inputs.brake * BRAKE_MAX_FORCE
  const brakeDecel = wantedBrakeForce / mass
  const brakeLoad = loadOnBrake(rig, cond, brakeDecel)
  const gripBrake = mu * brakeLoad * G
  const brakeForce = Math.min(wantedBrakeForce, gripBrake)

  // Whatever the friction circle has not already spent sideways is all the
  // wheel has left to push with.
  const longitudinalCeiling = Math.sqrt(
    Math.max(0, gripAvailable * gripAvailable - demandLateral * demandLateral),
  )
  const tractiveForce = state.isSlipping
    ? gripAvailable
    : Math.max(0, Math.min(demandLong, longitudinalCeiling))

  const netForce =
    tractiveForce -
    brakeForce * Math.sign(Math.max(state.v, 0.0001)) -
    mass * G * Math.sin(cond.slope) -
    DRAG_K * state.v * state.v -
    ROLLING_RESISTANCE[cond.surface] * mass * G * (state.v > 0.05 ? 1 : 0)

  return {
    mu,
    muGripping,
    muSurface: MU_SURFACE[cond.surface],
    totalMass: mass,
    loadOnDrive: load,
    gripAvailable,
    demand,
    demandDrive,
    demandSlope,
    demandLateral,
    loadOnBrake: brakeLoad,
    gripBrake,
    brakeForce,
    tractiveForce,
    requestedAccel,
    accel: netForce / mass,
    gripFraction: gripAvailable / METER_REFERENCE_FORCE,
    demandFraction: demand / METER_REFERENCE_FORCE,
  }
}

/**
 * How hard a six year old actually holds the throttle when they are excited.
 * The predict card is judged at this, not at a delicate feather.
 */
export const TYPICAL_THROTTLE = 0.6

/** Would this rig grip if you gave it this much thumb? */
export function willItGrip(rig: Rig, cond: Conditions, throttle = TYPICAL_THROTTLE): boolean {
  const budget = computeBudget(rig, cond, { throttle, brake: 0 }, { v: 0, isSlipping: false })
  return budget.demand <= budget.gripAvailable
}

/**
 * The gentlest throttle that actually gets the lorry moving without spinning,
 * or null if no amount of care will do it. Levels use this to prove they are
 * solvable, and the free-play yard uses it for the "stuck" hint.
 */
export function easiestWorkingThrottle(rig: Rig, cond: Conditions): number | null {
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const b = computeBudget(rig, cond, { throttle: t, brake: 0 }, { v: 0.5, isSlipping: false })
    if (b.demand <= b.gripAvailable && b.accel > 0.12) {
      return Math.round(t * 100) / 100
    }
  }
  return null
}

/** Is there any way at all to drive this rig up this bit of road? */
export const canGetGoing = (rig: Rig, cond: Conditions): boolean =>
  easiestWorkingThrottle(rig, cond) !== null

const ROAD_HALF_WIDTH = 2.6

/** One fixed 1/60 s tick. */
export function step(
  state: DriveState,
  rig: Rig,
  cond: Conditions,
  inputs: Inputs,
  dt: number,
): { state: DriveState; budget: Budget; events: PhysEvent[] } {
  const events: PhysEvent[] = []
  const next: DriveState = { ...state }

  const effectiveCond: Conditions = { ...cond, onBoards: cond.onBoards || state.boardsLeft > 0 }
  const budget = computeBudget(rig, effectiveCond, inputs, state)

  // --- spinning and un-spinning -------------------------------------------
  if (!state.isSlipping && budget.demand > budget.gripAvailable) {
    next.isSlipping = true
    events.push({ type: 'slip-start' })
  } else if (state.isSlipping && budget.demand < budget.gripAvailable * RECOVER_RATIO) {
    next.isSlipping = false
    events.push({ type: 'slip-end' })
  }

  const wantedBrake = inputs.brake * (budget.gripBrake > 0 ? 1 : 0)
  const brakeOverrun = inputs.brake > 0 && budget.brakeForce < inputs.brake * 0.98 * 30000
  if (!state.isSkidding && brakeOverrun && state.v > 1 && wantedBrake > 0) {
    next.isSkidding = true
    events.push({ type: 'skid-start' })
  } else if (state.isSkidding && (!brakeOverrun || state.v < 0.6)) {
    next.isSkidding = false
    events.push({ type: 'skid-end' })
  }

  // --- along the road ------------------------------------------------------
  let v = state.v + budget.accel * dt
  if (v < 0 && inputs.brake > 0.05) v = 0 // brakes hold it still rather than reversing
  if (v < -4) v = -4 // rolling back down a hill, but never alarmingly
  next.v = v
  next.s = state.s + v * dt

  if (next.boardsLeft > 0) {
    next.boardsLeft = Math.max(0, next.boardsLeft - Math.abs(v) * dt)
    if (next.boardsLeft === 0) events.push({ type: 'boards-used' })
  }

  // --- across the road -----------------------------------------------------
  const gripAll = budget.mu * budget.totalMass * G
  const longUsed = Math.abs(budget.tractiveForce - budget.brakeForce)
  const lateralAvailable = Math.sqrt(Math.max(0, gripAll * gripAll - longUsed * longUsed))

  if (budget.demandLateral > lateralAvailable) {
    const slideAccel = (budget.demandLateral - lateralAvailable) / budget.totalMass
    next.latV = state.latV + slideAccel * dt
  } else {
    // The driver simply steers back to the middle.
    next.latV = state.latV * 0.86
    const pull = Math.min(Math.abs(state.lat), 1.4 * dt) * Math.sign(state.lat)
    next.lat = state.lat - pull
  }
  next.lat = next.lat + next.latV * dt
  next.lat = Math.max(-1.2, Math.min(ROAD_HALF_WIDTH + 2.2, next.lat))
  if (next.lat >= ROAD_HALF_WIDTH && state.lat < ROAD_HALF_WIDTH) events.push({ type: 'verge' })
  if (next.lat >= ROAD_HALF_WIDTH) {
    // Soft verge: it scrubs speed off rather than ending anything.
    next.v *= 1 - 0.9 * dt
    next.latV *= 1 - 2.5 * dt
  }

  // --- what the wheel is doing --------------------------------------------
  const targetSpin = next.isSlipping
    ? Math.min(1, 0.35 + inputs.throttle * 0.65)
    : Math.max(0, next.spin - 6 * dt)
  next.spin = next.spin + (targetSpin - next.spin) * Math.min(1, 12 * dt)
  const wheelSurfaceSpeed = Math.abs(v) + next.spin * 14
  next.wheelAngle = (state.wheelAngle + wheelSurfaceSpeed * dt * 2.2) % (Math.PI * 2)

  return { state: next, budget, events }
}
