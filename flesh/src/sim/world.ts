/**
 * The drive itself: build a world, tick it, count the head at the far end.
 *
 * The simulation runs on a fixed 1/60s step regardless of frame rate. That is
 * partly for stability — boid steering with a variable step wobbles — and
 * partly because the acceptance tests in `tests/` drive this same function with
 * a synthetic input stream and no renderer at all. If the tests and the game
 * ever disagreed about the rules, the tests would be worthless.
 */

import { CREDITS, HERD, MIN_HEAD_TO_PASS, PLAYER, RIFLE, WORLD } from '@/core/tuning'
import { clamp, dist2, makeRng, type V3 } from '@/core/math'
import { Terrain } from '@/world/terrain'
import type { LevelDef } from '@/levels/types'
import type { DifficultyTuning } from '@/state/difficulty'
import { fireRifle, stepWeaponTimers, useGoad, useNetGun, useSonicBoomer, useWhoop } from './combat'
import { findMatriarch, livingHerd, loseAnimal, shockHerd, stepHerd } from './herd'
import { makePredator, spawnPosition, stepPredators } from './predators'
import { stepPlayer, tryToggleBike } from './player'
import {
  NO_UPGRADES,
  type ActiveUpgrades,
  type HerdAnimal,
  type InputFrame,
  type Player,
  type PredatorKind,
  type World,
} from './types'

export interface WorldOptions {
  level: LevelDef
  difficulty: DifficultyTuning
  upgrades?: ActiveUpgrades
  seed?: number
}

/* ------------------------------------------------------------- creation */

function makePlayer(pos: V3): Player {
  return {
    pos: { ...pos },
    vel: { x: 0, y: 0, z: 0 },
    heading: Math.PI,
    aimYaw: Math.PI,
    aimPitch: 0,
    grounded: true,
    coyote: 0,
    jumpBuffered: 0,
    jumpHeld: false,
    stamina: PLAYER.stamina.max,
    staminaHold: 0,
    sprinting: false,
    aiming: false,
    ammo: RIFLE.magazine,
    rechargeTimer: 0,
    gunHeat: 0,
    fireTimer: 0,
    goadTimer: 0,
    whoopTimer: 0,
    whoopActive: 0,
    netTimer: 0,
    boomerTimer: 0,
    onBike: false,
    bikeSpeed: 0,
    mountTimer: 0,
  }
}

export function createWorld(opts: WorldOptions): World {
  const { level, difficulty } = opts
  const seed = opts.seed ?? (level.terrain.seed ^ 0x5f3a) >>> 0
  const rng = makeRng(seed)
  const terrain = new Terrain(level.terrain)
  const pen = level.terrain.route[0]!

  const world: World = {
    time: 0,
    level,
    terrain,
    difficulty,
    rng,
    player: makePlayer({ x: pen.x, y: terrain.height(pen.x, pen.z), z: pen.z + 16 }),
    herd: [],
    predators: [],
    beaconIndex: 1,
    spawns: level.spawns.map((s) => ({ ...s, fired: false })),
    events: [],
    phase: 'playing',
    stats: {
      headStart: level.herd.count,
      headDelivered: 0,
      headLost: 0,
      headPrime: 0,
      shotsFired: 0,
      stragglersLost: 0,
      timeElapsed: 0,
      creditsEarned: 0,
    },
    mood: 'GRAZING',
    herdCentroid: { x: pen.x, y: terrain.height(pen.x, pen.z), z: pen.z },
    herdCalmAverage: HERD.calm.max,
    stormTimer: level.storm ? level.storm.interval : 0,
    stormFlash: 0,
    droneActive: opts.upgrades?.drone ?? false,
    upgrades: opts.upgrades ?? NO_UPGRADES,
    stampedeTimer: 0,
    scriptFlags: {},
    closeoutTimer: 0,
    nextId: 1,
    shake: 0,
  }

  world.herd = spawnHerd(world, level)
  // Seed the centroid before the first tick so spawn placement is sane.
  recomputeCentroid(world)
  return world
}

function spawnHerd(world: World, level: LevelDef): HerdAnimal[] {
  const { count, juveniles, styracosaurRatio } = level.herd
  const pen = level.terrain.route[0]!
  const out: HerdAnimal[] = []
  const rng = world.rng

  for (let i = 0; i < count; i++) {
    const matriarch = i === 0
    // Juveniles are drawn from the tail of the list, never the matriarch.
    const juvenile = !matriarch && i > count - 1 - juveniles
    const ang = (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3)
    const r = matriarch ? 0 : rng.range(4, 13)
    const x = pen.x + Math.sin(ang) * r
    const z = pen.z + Math.cos(ang) * r
    out.push({
      id: world.nextId++,
      kind: rng.next() < styracosaurRatio ? 'styracosaur' : 'triceratops',
      juvenile,
      matriarch,
      pos: { x, y: world.terrain.height(x, z), z },
      vel: { x: 0, y: 0, z: 0 },
      heading: Math.PI,
      calm: HERD.calm.max,
      state: 'GRAZING',
      panicTimer: 0,
      panicDir: { x: 0, y: 0, z: 1 },
      straggler: false,
      lost: false,
      delivered: false,
      grabbedBy: null,
      gait: rng.range(0, 10),
      grazeTarget: { x, y: 0, z },
      grazeRetarget: rng.range(1, 5),
      whoopTimer: 0,
      moveHold: 0,
      // She is visibly bigger, and wears the brand. You must be able to pick
      // her out at range or the leader trick does not read.
      scale: matriarch ? 1.22 : juvenile ? HERD.juvenileScale : rng.range(0.94, 1.06),
      speedSmoothed: 0,
    })
  }
  return out
}

function recomputeCentroid(world: World): void {
  const alive = livingHerd(world)
  if (alive.length === 0) return
  let x = 0
  let z = 0
  for (const a of alive) {
    x += a.pos.x
    z += a.pos.z
  }
  world.herdCentroid.x = x / alive.length
  world.herdCentroid.z = z / alive.length
  world.herdCentroid.y = world.terrain.height(world.herdCentroid.x, world.herdCentroid.z)
}

/* ------------------------------------------------------------------ tick */

/** Advance the world. `dt` is real elapsed time; stepping is fixed internally. */
export function stepWorld(world: World, input: InputFrame, dt: number): void {
  const steps = Math.min(WORLD.maxStepsPerFrame, Math.max(1, Math.round(dt / WORLD.fixedStep)))
  const h = WORLD.fixedStep
  for (let i = 0; i < steps; i++) {
    // Edge-triggered actions fire on the first sub-step only, so a slow frame
    // cannot turn one click of the goad into four.
    fixedStep(world, i === 0 ? input : { ...input, jump: false, goad: false, whoop: false, mount: false, net: false, boomer: false }, h)
  }
  world.shake = Math.max(0, world.shake - dt * 1.8)
  world.stormFlash = Math.max(0, world.stormFlash - dt * 2.6)
}

function fixedStep(world: World, input: InputFrame, dt: number): void {
  if (world.phase !== 'playing') {
    // Let the world settle visually after the gate, but stop the clock.
    stepPlayer(world, input, dt)
    return
  }

  world.time += dt
  world.stats.timeElapsed = world.time

  stepWeaponTimers(world, dt)

  /* -------------------------------------------------------- intent */

  if (input.mount) tryToggleBike(world)
  if (!world.player.onBike) {
    if (input.fire) fireRifle(world)
    if (input.goad) useGoad(world)
    if (input.net) useNetGun(world)
    if (input.boomer) useSonicBoomer(world)
  }
  // The whoop is a shout. You can do it from the saddle.
  if (input.whoop) useWhoop(world)

  stepPlayer(world, input, dt)
  stepHerd(world, dt)
  stepPredators(world, dt)

  updateStorm(world, dt)
  updateSpawns(world)
  updateScripts(world)
  updateBeacons(world)
  updateDelivery(world, dt)
}

/* ------------------------------------------------------------- the storm */

function updateStorm(world: World, dt: number): void {
  const storm = world.level.storm
  if (!storm) return
  world.stormTimer -= dt
  if (world.stormTimer > 0) return
  world.stormTimer = storm.interval * world.rng.range(0.75, 1.25)
  world.stormFlash = 1
  // "a lightning storm that drains calm across the whole herd every time it flashes"
  shockHerd(world, null, Infinity, HERD.calm.thunderCost)
  world.events.push({ t: 'thunder' })
}

/* ----------------------------------------------------------- spawn tickets */

export function herdProgress(world: World): number {
  const lead = findMatriarch(world)
  const p = lead ? lead.pos : world.herdCentroid
  return world.terrain.routeInfo(p.x, p.z).progress
}

function updateSpawns(world: World): void {
  const progress = herdProgress(world)
  for (const ticket of world.spawns) {
    if (ticket.fired) continue
    const byTime = ticket.at >= 0 && world.time >= ticket.at
    const byTrigger = ticket.triggerProgress !== undefined && progress >= ticket.triggerProgress
    if (!byTime && !byTrigger) continue
    ticket.fired = true
    spawnTicket(world, ticket.kind, ticket.count, ticket.mode, ticket.x, ticket.z)
  }
}

function spawnTicket(
  world: World,
  kind: PredatorKind,
  count: number,
  mode: 'ahead' | 'behind' | 'flank' | 'absolute',
  ax?: number,
  az?: number,
): void {
  const budget = WORLD.maxAgents - world.herd.length - world.predators.length
  const n = Math.max(0, Math.min(count, budget))
  for (let i = 0; i < n; i++) {
    const base = spawnPosition(world, mode, ax, az)
    // A pack arrives together but not on top of each other.
    const jitter = kind === 'raptor' ? 9 : 14
    const x = base.x + world.rng.range(-jitter, jitter)
    const z = base.z + world.rng.range(-jitter, jitter)
    world.predators.push(makePredator(world, kind, x, z))
  }

  if (n > 0) {
    const line = ANNOUNCE[kind]
    if (line) world.events.push({ t: 'toast', text: line })
  }
}

const ANNOUNCE: Partial<Record<PredatorKind, string>> = {
  rex: 'Something in the treeline.',
  raptor: 'Pack coming in. They cannot take a head — but they can take the herd.',
  pteranodon: 'Shadow overhead. Look up.',
  bighungry: 'The water just moved. All of it.',
  oldoneeye: 'That is her. Left eye is dead white. She knows the herd is here.',
}

/* --------------------------------------------------------- scripted beats */

function updateScripts(world: World): void {
  const script = world.level.scriptedStampede
  if (script && !world.scriptFlags.stampede) {
    if (herdProgress(world) >= script.atProgress) {
      world.scriptFlags.stampede = true
      // The Bone Gulch set piece. Everything bolts at once, on the shelf,
      // with the drop on the right. This is the moment people remember.
      for (const a of livingHerd(world)) {
        a.calm = Math.min(a.calm, HERD.calm.panicThreshold - 6)
      }
      world.shake = Math.max(world.shake, 1)
      world.events.push({ t: 'thunder' })
      world.events.push({ t: 'toast', text: 'Rockfall! They are running — turn them off the edge!' })
    }
  }

  // She is the gate on level six. If the player outruns her trigger, she is
  // waiting for them at the fence anyway.
  if (world.level.boss === 'oldoneeye' && !world.scriptFlags.bossForced) {
    const atGate = world.beaconIndex >= world.level.terrain.route.length - 1
    const present = world.predators.some((p) => p.kind === 'oldoneeye' && p.alive)
    if (atGate && !present) {
      world.scriptFlags.bossForced = true
      const ticket = world.spawns.find((s) => s.kind === 'oldoneeye')
      if (ticket) ticket.fired = true
      spawnTicket(world, 'oldoneeye', 1, 'ahead')
    }
  }
}

/* ---------------------------------------------------------------- beacons */

export function currentBeacon(world: World): { x: number; z: number; label: string } | null {
  const route = world.level.terrain.route
  return route[Math.min(world.beaconIndex, route.length - 1)] ?? null
}

export function isFinalBeacon(world: World): boolean {
  return world.beaconIndex >= world.level.terrain.route.length - 1
}

function updateBeacons(world: World): void {
  if (isFinalBeacon(world)) return
  const beacon = currentBeacon(world)
  if (!beacon) return
  const lead = findMatriarch(world)
  if (!lead) return
  if (dist2(lead.pos, { x: beacon.x, y: 0, z: beacon.z } as V3) > WORLD.beaconRadius) return

  /* "If it is still a straggler when you reach the next beacon, it is lost."
     This is the whole reason the hover bike exists. */
  for (const a of livingHerd(world)) {
    if (a === lead) continue
    if (a.straggler && dist2(a.pos, lead.pos) > world.difficulty.stragglerLeash) {
      loseAnimal(world, a, 'strayed')
    }
  }

  world.beaconIndex++
  world.events.push({ t: 'beacon', index: world.beaconIndex })
  const next = currentBeacon(world)
  world.events.push({
    t: 'toast',
    text: next ? `Marker made. Next: ${next.label}.` : 'Marker made. Gate ahead.',
  })
}

/* --------------------------------------------------------------- delivery */

function updateDelivery(world: World, dt: number): void {
  if (!isFinalBeacon(world)) return
  const gate = currentBeacon(world)
  if (!gate) return

  if (gateLocked(world)) {
    world.scriptFlags.gateLockNotified ||= false
    if (!world.scriptFlags.gateLockNotified && dist2(world.player.pos, { x: gate.x, y: 0, z: gate.z } as V3) < 40) {
      world.scriptFlags.gateLockNotified = true
      world.events.push({ t: 'toast', text: 'Fence is hot and the gate is shut. Nothing goes through while she is up.' })
    }
    return
  }

  for (const a of world.herd) {
    if (a.lost || a.delivered || a.grabbedBy !== null) continue
    if (dist2(a.pos, { x: gate.x, y: 0, z: gate.z } as V3) > WORLD.gateRadius) continue
    a.delivered = true
    world.stats.headDelivered++
    // "50 bonus per head that finishes at over 75 calm"
    const prime = a.calm > HERD.calm.primeThreshold
    if (prime) world.stats.headPrime++
    world.events.push({ t: 'head_delivered', animal: a.id, prime, index: world.stats.headDelivered })
    if (prime) world.events.push({ t: 'toast', text: 'Prime condition. Trans-Time thanks you.' })
  }

  const remaining = livingHerd(world)
  if (remaining.length === 0) {
    finishRun(world)
    return
  }

  /* Close-out. Standing at the gate with head already through writes off
     whatever is still out there — because the alternative is a drive that can
     never end because one animal is grazing on a hill forty minutes away. */
  const playerAtGate = dist2(world.player.pos, { x: gate.x, y: 0, z: gate.z } as V3) < WORLD.gateRadius
  if (playerAtGate && world.stats.headDelivered > 0) {
    world.scriptFlags.closingOut = true
    world.closeoutTimer += dt
    if (world.closeoutTimer >= CLOSEOUT_SECONDS) {
      for (const a of remaining) loseAnimal(world, a, 'strayed')
      finishRun(world)
    }
  } else {
    world.scriptFlags.closingOut = false
    world.closeoutTimer = 0
  }
}

export const CLOSEOUT_SECONDS = 6

export function closeoutProgress(world: World): number {
  return clamp(world.closeoutTimer / CLOSEOUT_SECONDS, 0, 1)
}

/** Level six's gate stays shut until she is down. */
export function gateLocked(world: World): boolean {
  if (world.level.boss !== 'oldoneeye') return false
  const boss = world.predators.find((p) => p.kind === 'oldoneeye')
  if (!boss) return !world.scriptFlags.bossDefeated
  if (boss.state === 'DOWN') {
    if (!world.scriptFlags.bossDefeated) {
      world.scriptFlags.bossDefeated = true
      world.events.push({ t: 'toast', text: 'She is down. Gate is open — walk them through.' })
    }
    return false
  }
  return true
}

function finishRun(world: World): void {
  if (world.phase !== 'playing') return
  world.stats.creditsEarned = computeCredits(world)
  if (world.stats.headDelivered < MIN_HEAD_TO_PASS) {
    world.phase = 'failed'
    world.events.push({ t: 'failed' })
  } else {
    world.phase = 'complete'
    world.events.push({ t: 'complete' })
  }
}

/* ---------------------------------------------------------------- credits */

export function computeCredits(world: World): number {
  const s = world.stats
  let total = s.headDelivered * CREDITS.perHead
  total += s.headPrime * CREDITS.primeBonus
  if (s.stragglersLost === 0) total += CREDITS.noStragglersLost
  // "300 for a level completed without firing the rifle at all"
  if (s.shotsFired === 0) total += CREDITS.pacifist
  return total
}

export interface CreditLine {
  label: string
  amount: number
}

export function creditBreakdown(world: World): CreditLine[] {
  const s = world.stats
  const lines: CreditLine[] = [
    { label: `${s.headDelivered} head delivered`, amount: s.headDelivered * CREDITS.perHead },
  ]
  if (s.headPrime > 0) {
    lines.push({ label: `${s.headPrime} in prime condition`, amount: s.headPrime * CREDITS.primeBonus })
  }
  if (s.stragglersLost === 0) lines.push({ label: 'No stragglers lost', amount: CREDITS.noStragglersLost })
  if (s.shotsFired === 0) lines.push({ label: 'Rifle never fired', amount: CREDITS.pacifist })
  return lines
}
