/**
 * Threats.
 *
 * Every one of these is designed around the same job: take the player's
 * attention off the herd for a measurable number of seconds. A rex that killed
 * Reagan would be a different game. A rex that makes you spend eight seconds
 * away from twelve drifting animals is this one.
 *
 * Note that almost nothing here targets Reagan. Rexes go for stragglers,
 * raptors go for the herd's nerve, Old One Eye goes for the last head through
 * the gate. Being ignored by the monster is what makes you chase it.
 */

import {
  BIG_HUNGRY,
  HERD,
  PATIENCE,
  OLD_ONE_EYE,
  PHOBOSUCHUS,
  PTERANODON,
  RAPTOR,
  REX,
  WORLD,
} from '@/core/tuning'
import { approachAngle, clamp, dist2, headingOf, len2, type V3 } from '@/core/math'
import { isInBlindCone } from './combat'
import { loseAnimal } from './herd'
import type { HerdAnimal, Predator, PredatorKind, World } from './types'

/* ---------------------------------------------------------------- spawning */

const KIND_DEFAULTS: Record<PredatorKind, { radius: number; scale: number; state: Predator['state'] }> = {
  rex: { radius: REX.radius, scale: 1, state: 'STALK' },
  raptor: { radius: RAPTOR.radius, scale: 1, state: 'STALK' },
  pteranodon: { radius: PTERANODON.radius, scale: 1, state: 'STALK' },
  phobosuchus: { radius: PHOBOSUCHUS.radius, scale: 1, state: 'HIDDEN' },
  bighungry: { radius: BIG_HUNGRY.radius, scale: 1.6, state: 'SUBMERGED' },
  oldoneeye: { radius: OLD_ONE_EYE.radius, scale: OLD_ONE_EYE.scale, state: 'STALK' },
}

export function makePredator(world: World, kind: PredatorKind, x: number, z: number): Predator {
  const d = KIND_DEFAULTS[kind]
  const y = world.terrain.height(x, z)
  const p: Predator = {
    id: world.nextId++,
    kind,
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    heading: headingOf(world.herdCentroid.x - x, world.herdCentroid.z - z),
    state: d.state,
    stateTimer: kind === 'rex' ? world.rng.range(0.5, 1.6) : 0.6,
    targetId: -1,
    hits: 0,
    hitWindow: 0,
    radius: d.radius,
    scale: d.scale,
    staggers: 0,
    neckHits: 0,
    lastSoundAt: null,
    lastSoundTimer: 0,
    spooked: 0,
    marked: false,
    alive: true,
    age: 0,
    altitude: kind === 'pteranodon' ? PTERANODON.cruiseHeight : 0,
    repath: 0,
    anchor: { x, y, z },
    gait: 0,
  }
  if (kind === 'pteranodon') p.pos.y = y + PTERANODON.cruiseHeight
  return p
}

/** Where a spawn ticket puts something, relative to the herd and the trail. */
export function spawnPosition(
  world: World,
  mode: 'ahead' | 'behind' | 'flank' | 'absolute',
  ax?: number,
  az?: number,
): { x: number; z: number } {
  if (mode === 'absolute') return { x: ax ?? 0, z: az ?? 0 }
  const c = world.herdCentroid
  const route = world.level.terrain.route
  const target = route[Math.min(world.beaconIndex, route.length - 1)]!
  let fx = target.x - c.x
  let fz = target.z - c.z
  const l = len2(fx, fz) || 1
  fx /= l
  fz /= l

  const dist = world.rng.range(52, 78)
  if (mode === 'ahead') return { x: c.x + fx * dist, z: c.z + fz * dist }
  if (mode === 'behind') return { x: c.x - fx * dist, z: c.z - fz * dist }
  // Flank: perpendicular, either side. Rexes come out of the treeline.
  const side = world.rng.next() < 0.5 ? 1 : -1
  return { x: c.x + -fz * dist * side, z: c.z + fx * dist * side }
}

/* --------------------------------------------------------------- the tick */

export function stepPredators(world: World, dt: number): void {
  for (const p of world.predators) {
    if (!p.alive) continue

    if (p.lastSoundTimer > 0) p.lastSoundTimer -= dt
    p.stateTimer -= dt
    p.age += dt

    // Out of patience: break off and go. A rex that has spent nearly two
    // minutes failing to get a head is not going to get one.
    const patience = PATIENCE[p.kind] ?? Infinity
    if (p.age > patience && p.state !== 'GRAB' && p.state !== 'FLEE' && p.state !== 'DOWN') {
      p.state = 'FLEE'
      p.stateTimer = 18
    }
    // Kinds that do not implement a back-off still need the timer to expire.
    if (p.spooked > 0 && (p.kind === 'pteranodon' || p.kind === 'bighungry' || p.kind === 'oldoneeye')) {
      p.spooked -= dt
    }

    switch (p.kind) {
      case 'rex':
        stepRex(world, p, dt)
        break
      case 'raptor':
        stepRaptor(world, p, dt)
        break
      case 'pteranodon':
        stepPteranodon(world, p, dt)
        break
      case 'phobosuchus':
        stepPhobosuchus(world, p, dt)
        break
      case 'bighungry':
        stepBigHungry(world, p, dt)
        break
      case 'oldoneeye':
        stepOldOneEye(world, p, dt)
        break
    }

    integratePredator(world, p, dt)
  }

  // Reap anything that has walked off the map, and keep the agent budget.
  world.predators = world.predators.filter((p) => p.alive)
  if (world.predators.length > WORLD.maxAgents - world.herd.length) {
    const excess = world.predators.length - (WORLD.maxAgents - world.herd.length)
    let removed = 0
    world.predators = world.predators.filter((p) => {
      if (removed >= excess) return true
      // Only ever cull something far away and not currently doing anything.
      if (p.state === 'FLEE' && dist2(p.pos, world.player.pos) > 120) {
        removed++
        return false
      }
      return true
    })
  }
}

/* ---------------------------------------------------------- shared helpers */

/**
 * "targets the nearest straggler, not Reagan". The bias is large enough that a
 * straggler forty metres away outranks a herd animal ten metres away, which is
 * exactly the pressure that makes retrieval urgent.
 */
function pickHerdTarget(world: World, p: Predator, preferJuveniles = false): HerdAnimal | null {
  let best: HerdAnimal | null = null
  let bestScore = Infinity
  for (const a of world.herd) {
    if (a.lost || a.delivered || a.grabbedBy !== null) continue
    let score = dist2(p.pos, a.pos)
    if (a.straggler) score -= REX.stragglerBias
    if (preferJuveniles && a.juvenile) score -= 22
    if (score < bestScore) {
      bestScore = score
      best = a
    }
  }
  return best
}

function targetOf(world: World, p: Predator): HerdAnimal | null {
  if (p.targetId < 0) return null
  const a = world.herd.find((h) => h.id === p.targetId)
  if (!a || a.lost || a.delivered) return null
  return a
}

function seek(p: Predator, tx: number, tz: number, speed: number, turnRate: number, dt: number): void {
  const dx = tx - p.pos.x
  const dz = tz - p.pos.z
  const d = len2(dx, dz)
  if (d < 1e-3) return
  const want = headingOf(dx, dz)
  p.heading = approachAngle(p.heading, want, turnRate * dt)
  // It accelerates along its nose, not sideways: that is what makes the two-step
  // stomp read as weight rather than as a sliding sprite.
  const fx = Math.sin(p.heading)
  const fz = Math.cos(p.heading)
  const align = clamp(fx * (dx / d) + fz * (dz / d), 0, 1)
  const target = speed * (0.35 + 0.65 * align)
  p.vel.x += (fx * target - p.vel.x) * Math.min(1, dt * 4)
  p.vel.z += (fz * target - p.vel.z) * Math.min(1, dt * 4)
}

function beginGrab(world: World, p: Predator, a: HerdAnimal, duration: number): void {
  a.grabbedBy = p.id
  p.targetId = a.id
  p.state = 'GRAB'
  p.stateTimer = duration
  world.events.push({ t: 'grab', at: { ...a.pos }, animal: a.id })
  world.events.push({ t: 'toast', text: 'It has one. Shoot it or goad it — it will drop her.' })
}

/** Drag the held animal away from the trail. Four seconds to intervene. */
function stepDrag(world: World, p: Predator, dt: number, speed: number): void {
  const a = targetOf(world, p)
  if (!a || a.grabbedBy !== p.id) {
    p.state = 'STALK'
    p.targetId = -1
    return
  }
  // Away from the herd, which is also away from wherever the player is standing.
  let dx = p.pos.x - world.herdCentroid.x
  let dz = p.pos.z - world.herdCentroid.z
  const l = len2(dx, dz) || 1
  dx /= l
  dz /= l
  p.heading = approachAngle(p.heading, headingOf(dx, dz), 1.6 * dt)
  p.vel.x = dx * speed
  p.vel.z = dz * speed

  a.pos.x = p.pos.x + Math.sin(p.heading) * p.radius * 1.6
  a.pos.z = p.pos.z + Math.cos(p.heading) * p.radius * 1.6
  a.pos.y = world.terrain.height(a.pos.x, a.pos.z) + 1.2
  a.vel.x = p.vel.x
  a.vel.z = p.vel.z

  if (p.stateTimer <= 0) {
    loseAnimal(world, a, 'taken')
    p.targetId = -1
    p.state = 'FLEE'
    p.stateTimer = 14
  }
}

function stepFlee(world: World, p: Predator, dt: number, speed: number): void {
  let dx = p.pos.x - world.herdCentroid.x
  let dz = p.pos.z - world.herdCentroid.z
  const l = len2(dx, dz) || 1
  seek(p, p.pos.x + (dx / l) * 60, p.pos.z + (dz / l) * 60, speed, 1.4, dt)
  if (p.stateTimer <= 0 || !world.terrain.inBounds(p.pos.x, p.pos.z)) p.alive = false
}

/** How long a goaded predator keeps its distance before trying again. */
export const SPOOK_SECONDS = 5

/**
 * Backing off after a shove. It runs from the trail boss rather than from the
 * herd, so a well-placed goad puts the animal between you and your stock — the
 * skill expression the brief asks for.
 */
function stepSpooked(world: World, p: Predator, dt: number, speed: number): void {
  p.spooked -= dt
  let dx = p.pos.x - world.player.pos.x
  let dz = p.pos.z - world.player.pos.z
  const l = len2(dx, dz) || 1
  dx /= l
  dz /= l
  seek(p, p.pos.x + dx * 40, p.pos.z + dz * 40, speed, 2.4, dt)
}

function stepStunned(p: Predator, dt: number): boolean {
  if (p.state === 'DOWN' || p.state === 'ROOTED' || p.state === 'STAGGERED') {
    // Knockback bleeds off rather than stopping dead, so a goad reads as a shove.
    const decay = p.state === 'STAGGERED' ? 3.4 : 12
    p.vel.x -= p.vel.x * Math.min(1, decay * dt)
    p.vel.z -= p.vel.z * Math.min(1, decay * dt)
    return true
  }
  return false
}

/* -------------------------------------------------------------------- rex */

function stepRex(world: World, p: Predator, dt: number): void {
  if (stepStunned(p, dt)) {
    if (p.stateTimer <= 0) {
      p.state = 'STALK'
      p.hits = 0
      p.stateTimer = 0.6
    }
    return
  }
  if (p.spooked > 0 && p.state !== 'GRAB') {
    p.state = 'STALK'
    p.repath = 0
    stepSpooked(world, p, dt, REX.speed)
    return
  }

  switch (p.state) {
    case 'STALK': {
      p.repath -= dt
      if (p.repath <= 0 || !targetOf(world, p)) {
        const t = pickHerdTarget(world, p)
        p.targetId = t ? t.id : -1
        p.repath = REX.repathInterval
      }
      const t = targetOf(world, p)
      if (!t) {
        p.state = 'FLEE'
        p.stateTimer = 16
        return
      }
      seek(p, t.pos.x, t.pos.z, REX.speed, REX.turnRate, dt)
      if (dist2(p.pos, t.pos) < REX.lungeRange + REX.approachStandoff) {
        p.state = 'TELEGRAPH'
        p.stateTimer = REX.telegraph
        world.events.push({ t: 'roar', at: { ...p.pos }, kind: 'rex' })
      }
      break
    }
    case 'TELEGRAPH': {
      // 1.2 seconds of roaring with its feet planted: the window to intervene.
      const t = targetOf(world, p)
      if (t) p.heading = approachAngle(p.heading, headingOf(t.pos.x - p.pos.x, t.pos.z - p.pos.z), 1.4 * dt)
      p.vel.x *= 1 - Math.min(1, dt * 5)
      p.vel.z *= 1 - Math.min(1, dt * 5)
      if (p.stateTimer <= 0) {
        p.state = 'LUNGE'
        p.stateTimer = REX.lungeDuration
      }
      break
    }
    case 'LUNGE': {
      const t = targetOf(world, p)
      const fx = Math.sin(p.heading)
      const fz = Math.cos(p.heading)
      p.vel.x = fx * REX.chargeSpeed
      p.vel.z = fz * REX.chargeSpeed
      if (t && dist2(p.pos, t.pos) < p.radius + HERD.radius * t.scale + 1.4) {
        beginGrab(world, p, t, REX.dragDuration)
        return
      }
      if (p.stateTimer <= 0) {
        p.state = 'STALK'
        p.repath = 0
      }
      break
    }
    case 'GRAB':
      stepDrag(world, p, dt, REX.dragSpeed)
      break
    case 'FLEE':
      stepFlee(world, p, dt, REX.speed)
      break
    default:
      p.state = 'STALK'
  }
}

/* ----------------------------------------------------------------- raptor */

/**
 * "Cannot take a herd animal alone but drives panic hard. Ignore them and the
 * herd stampedes even though nothing was actually taken."
 *
 * So the raptor never grabs. It circles, it darts in, and its fear aura does
 * all the damage. The lesson of the level it appears in is to deal with the
 * panic dealers before the thing that looks more dangerous.
 */
function stepRaptor(world: World, p: Predator, dt: number): void {
  if (stepStunned(p, dt)) {
    if (p.stateTimer <= 0) {
      p.state = 'STALK'
      p.hits = 0
    }
    return
  }
  if (p.spooked > 0) {
    p.state = 'STALK'
    p.repath = 0
    stepSpooked(world, p, dt, RAPTOR.speed)
    return
  }

  switch (p.state) {
    case 'STALK': {
      p.repath -= dt
      if (p.repath <= 0 || !targetOf(world, p)) {
        const t = pickHerdTarget(world, p, true)
        p.targetId = t ? t.id : -1
        p.repath = 1.4
      }
      const t = targetOf(world, p)
      if (!t) {
        p.state = 'FLEE'
        p.stateTimer = 12
        return
      }
      // Orbit rather than close: it wants to be near, not on top of.
      const ang = headingOf(p.pos.x - t.pos.x, p.pos.z - t.pos.z) + dt * 1.1
      const orbit = RAPTOR.harassRadius
      seek(
        p,
        t.pos.x + Math.sin(ang) * orbit,
        t.pos.z + Math.cos(ang) * orbit,
        RAPTOR.speed,
        RAPTOR.turnRate,
        dt,
      )
      if (dist2(p.pos, t.pos) < orbit * 1.25 && p.stateTimer <= 0) {
        p.state = 'TELEGRAPH'
        p.stateTimer = RAPTOR.telegraph
      }
      break
    }
    case 'TELEGRAPH':
      if (p.stateTimer <= 0) {
        p.state = 'LUNGE'
        p.stateTimer = 0.5
      }
      break
    case 'LUNGE': {
      const t = targetOf(world, p)
      if (t) {
        seek(p, t.pos.x, t.pos.z, RAPTOR.speed * 1.25, RAPTOR.turnRate * 1.6, dt)
        if (dist2(p.pos, t.pos) < p.radius + HERD.radius * t.scale + 1) {
          // It cannot take her. It can terrify her.
          t.calm = clamp(t.calm - 26, 0, HERD.calm.max)
          p.state = 'STALK'
          p.stateTimer = world.rng.range(1.6, 3.2)
          p.repath = 0
        }
      }
      if (p.stateTimer <= 0) {
        p.state = 'STALK'
        p.stateTimer = world.rng.range(1.2, 2.6)
      }
      break
    }
    case 'FLEE':
      stepFlee(world, p, dt, RAPTOR.speed)
      break
    default:
      p.state = 'STALK'
  }
}

/* ------------------------------------------------------------- pteranodon */

/**
 * "Attacks from above, targets Reagan and juvenile herd animals. Forces you to
 * look up and breaks the habit of only scanning the treeline."
 */
function stepPteranodon(world: World, p: Predator, dt: number): void {
  const groundY = world.terrain.height(p.pos.x, p.pos.z)

  if (p.state === 'DOWN' || p.state === 'ROOTED') {
    // A stunned flyer comes down. It flops over on the ground like everything else.
    p.altitude = Math.max(0, p.altitude - dt * 18)
    p.pos.y = groundY + p.altitude
    p.vel.x *= 1 - Math.min(1, dt * 4)
    p.vel.z *= 1 - Math.min(1, dt * 4)
    if (p.stateTimer <= 0) {
      p.state = 'STALK'
      p.hits = 0
    }
    return
  }
  if (p.state === 'STAGGERED') {
    if (p.stateTimer <= 0) p.state = 'STALK'
    p.pos.y = groundY + p.altitude
    return
  }

  switch (p.state) {
    case 'STALK': {
      p.altitude += (PTERANODON.cruiseHeight - p.altitude) * Math.min(1, dt * 2)
      p.repath -= dt
      if (p.repath <= 0) {
        // Half the time it wants Reagan, half the time it wants a juvenile.
        const wantsPlayer = world.rng.next() < 0.5
        if (wantsPlayer) p.targetId = -1
        else {
          const juvenile =
            world.herd.find((a) => a.juvenile && !a.lost && !a.delivered) ?? pickHerdTarget(world, p, true)
          p.targetId = juvenile ? juvenile.id : -1
        }
        p.repath = world.rng.range(4, 7)
      }
      const t = targetOf(world, p)
      const tx = t ? t.pos.x : world.player.pos.x
      const tz = t ? t.pos.z : world.player.pos.z
      const ang = world.time * 0.6 + p.id
      seek(p, tx + Math.sin(ang) * 26, tz + Math.cos(ang) * 26, PTERANODON.speed, PTERANODON.turnRate, dt)
      if (dist2(p.pos, { x: tx, y: 0, z: tz } as V3) < 34 && p.stateTimer <= 0) {
        p.state = 'TELEGRAPH'
        p.stateTimer = PTERANODON.telegraph
        world.events.push({ t: 'roar', at: { ...p.pos }, kind: 'pteranodon' })
      }
      break
    }
    case 'TELEGRAPH': {
      const t = targetOf(world, p)
      const tx = t ? t.pos.x : world.player.pos.x
      const tz = t ? t.pos.z : world.player.pos.z
      p.heading = approachAngle(p.heading, headingOf(tx - p.pos.x, tz - p.pos.z), 3 * dt)
      if (p.stateTimer <= 0) {
        p.state = 'LUNGE'
        p.stateTimer = 1.5
      }
      break
    }
    case 'LUNGE': {
      const t = targetOf(world, p)
      const tx = t ? t.pos.x : world.player.pos.x
      const tz = t ? t.pos.z : world.player.pos.z
      p.altitude += (2.4 - p.altitude) * Math.min(1, dt * 5)
      seek(p, tx, tz, PTERANODON.diveSpeed, PTERANODON.turnRate * 2, dt)
      const near = dist2(p.pos, { x: tx, y: 0, z: tz } as V3) < 3.5
      if (near) {
        if (t) t.calm = clamp(t.calm - 34, 0, HERD.calm.max)
        else world.shake = Math.max(world.shake, 0.6)
        p.state = 'RECOVER'
        p.stateTimer = 3
      }
      if (p.stateTimer <= 0) {
        p.state = 'RECOVER'
        p.stateTimer = 2.5
      }
      break
    }
    case 'RECOVER':
      p.altitude += (PTERANODON.cruiseHeight - p.altitude) * Math.min(1, dt * 1.6)
      if (p.stateTimer <= 0) {
        p.state = 'STALK'
        p.stateTimer = world.rng.range(2, 4)
        p.repath = 0
      }
      break
    case 'FLEE':
      stepFlee(world, p, dt, PTERANODON.speed)
      break
    default:
      p.state = 'STALK'
  }

  p.pos.y = groundY + p.altitude
}

/* ------------------------------------------------------------ phobosuchus */

/**
 * "Invisible until the herd enters the water. The counter is to send the herd
 * across at a shallow ford you have to spot first, not to fight it."
 *
 * So it never leaves its basin, and it only wakes for something standing in
 * deep water. Use the ford and it never appears at all.
 */
function stepPhobosuchus(world: World, p: Predator, dt: number): void {
  if (stepStunned(p, dt)) {
    if (p.stateTimer <= 0) {
      p.state = 'HIDDEN'
      p.hits = 0
    }
    return
  }
  if (p.spooked > 0 && p.state !== 'HIDDEN' && p.state !== 'GRAB') {
    stepSpooked(world, p, dt, PHOBOSUCHUS.speed)
    return
  }

  if (p.state === 'HIDDEN') {
    p.pos.y = world.terrain.height(p.pos.x, p.pos.z)
    for (const a of world.herd) {
      if (a.lost || a.delivered) continue
      if (world.terrain.waterDepth(a.pos.x, a.pos.z) < 1.0) continue
      if (dist2(a.pos, p.pos) > PHOBOSUCHUS.revealRadius) continue
      p.state = 'STALK'
      p.targetId = a.id
      world.events.push({ t: 'roar', at: { ...p.pos }, kind: 'phobosuchus' })
      world.events.push({ t: 'toast', text: 'Something moved in the water.' })
      break
    }
    return
  }

  switch (p.state) {
    case 'STALK': {
      const t = targetOf(world, p) ?? pickHerdTarget(world, p)
      if (!t) {
        p.state = 'HIDDEN'
        return
      }
      p.targetId = t.id
      seek(p, t.pos.x, t.pos.z, PHOBOSUCHUS.speed, PHOBOSUCHUS.turnRate, dt)
      if (dist2(p.pos, t.pos) < 6) {
        p.state = 'TELEGRAPH'
        p.stateTimer = PHOBOSUCHUS.telegraph
      }
      // It will not leave the water to chase anything.
      if (world.terrain.waterDepth(p.pos.x, p.pos.z) < 0.4) {
        seek(p, p.anchor.x, p.anchor.z, PHOBOSUCHUS.speed, PHOBOSUCHUS.turnRate, dt)
      }
      break
    }
    case 'TELEGRAPH':
      if (p.stateTimer <= 0) {
        p.state = 'LUNGE'
        p.stateTimer = 0.6
      }
      break
    case 'LUNGE': {
      const t = targetOf(world, p)
      if (t) {
        seek(p, t.pos.x, t.pos.z, PHOBOSUCHUS.speed * 1.8, PHOBOSUCHUS.turnRate * 2, dt)
        if (dist2(p.pos, t.pos) < p.radius + HERD.radius * t.scale + 1) {
          beginGrab(world, p, t, PHOBOSUCHUS.dragDuration)
          return
        }
      }
      if (p.stateTimer <= 0) p.state = 'STALK'
      break
    }
    case 'GRAB':
      stepDrag(world, p, dt, PHOBOSUCHUS.speed)
      break
    default:
      p.state = 'STALK'
  }
}

/* -------------------------------------------------- BOSS: Big Hungry */

/**
 * "an enormous nothosaur that lunges from the water on a rhythm you have to
 * read and cross between."
 *
 * The rhythm is fixed and audible: down for 3.4s, up for 0.8s, wind-up for 1s,
 * strike for 1.1s, recover for 2.2s. Learnable in two cycles, and the whole
 * fight is getting twelve animals through a gap that opens every 8.5 seconds.
 */
function stepBigHungry(world: World, p: Predator, dt: number): void {
  if (p.state === 'DOWN') {
    p.vel.x = 0
    p.vel.z = 0
    return
  }
  if (p.state === 'STAGGERED') {
    p.vel.x = 0
    p.vel.z = 0
    if (p.stateTimer <= 0) {
      p.state = 'SUBMERGED'
      p.stateTimer = BIG_HUNGRY.submergedTime
    }
    return
  }

  // It never moves off its anchor; it only rises, strikes and sinks.
  p.pos.x += (p.anchor.x - p.pos.x) * Math.min(1, dt * 1.5)
  p.pos.z += (p.anchor.z - p.pos.z) * Math.min(1, dt * 1.5)

  switch (p.state) {
    case 'SUBMERGED':
      if (p.stateTimer <= 0) {
        p.state = 'RISING'
        p.stateTimer = BIG_HUNGRY.risingTime
        world.events.push({ t: 'roar', at: { ...p.pos }, kind: 'bighungry' })
      }
      break
    case 'RISING':
      if (p.stateTimer <= 0) {
        p.state = 'TELEGRAPH'
        p.stateTimer = BIG_HUNGRY.telegraph
        // It aims where the most head are standing when it comes up.
        const t = pickHerdTarget(world, p)
        p.targetId = t ? t.id : -1
      }
      break
    case 'TELEGRAPH': {
      const t = targetOf(world, p)
      const tx = t ? t.pos.x : world.player.pos.x
      const tz = t ? t.pos.z : world.player.pos.z
      p.heading = approachAngle(p.heading, headingOf(tx - p.pos.x, tz - p.pos.z), 2.4 * dt)
      if (p.stateTimer <= 0) {
        p.state = 'LUNGE'
        p.stateTimer = BIG_HUNGRY.lungeTime
        world.shake = Math.max(world.shake, 0.9)
      }
      break
    }
    case 'LUNGE': {
      // The strike sweeps a wedge in front of it out to the lunge reach.
      const fx = Math.sin(p.heading)
      const fz = Math.cos(p.heading)
      for (const a of world.herd) {
        if (a.lost || a.delivered || a.grabbedBy !== null) continue
        const dx = a.pos.x - p.pos.x
        const dz = a.pos.z - p.pos.z
        const d = len2(dx, dz)
        if (d > BIG_HUNGRY.lungeReach) continue
        if ((dx / d) * fx + (dz / d) * fz < 0.72) continue
        beginGrab(world, p, a, 2.6)
        break
      }
      if (p.stateTimer <= 0) {
        p.state = p.targetId >= 0 && targetOf(world, p)?.grabbedBy === p.id ? 'GRAB' : 'RECOVER'
        p.stateTimer = p.state === 'GRAB' ? 2.6 : BIG_HUNGRY.recoverTime
      }
      break
    }
    case 'GRAB':
      stepDrag(world, p, dt, 3.2)
      if (p.state !== 'GRAB') {
        p.state = 'RECOVER'
        p.stateTimer = BIG_HUNGRY.recoverTime
      }
      break
    case 'RECOVER':
      if (p.stateTimer <= 0) {
        p.state = 'SUBMERGED'
        p.stateTimer = BIG_HUNGRY.submergedTime
      }
      break
    default:
      p.state = 'SUBMERGED'
      p.stateTimer = BIG_HUNGRY.submergedTime
  }
}

/* ------------------------------------------------ BOSS: Old One Eye */

/**
 * A hundred and twenty years old, half again the size of a rex, and blind down
 * her left side since Reagan's goad took the eye.
 *
 * She does not chase Reagan. She hunts the herd, patiently, while you are
 * trying to get the last head through the gate. Body shots do nothing. She
 * tracks sound, so firing rotates her toward you — which means the rifle is
 * actively counterproductive until you have already staggered her from the
 * blind flank and opened the neck.
 *
 * Nothing in the game tells the player any of this.
 */
function stepOldOneEye(world: World, p: Predator, dt: number): void {
  if (p.state === 'DOWN') {
    p.vel.x = 0
    p.vel.z = 0
    return
  }
  if (p.state === 'STAGGERED') {
    p.vel.x -= p.vel.x * Math.min(1, dt * 6)
    p.vel.z -= p.vel.z * Math.min(1, dt * 6)
    if (p.stateTimer <= 0) {
      p.state = 'RECOVER'
      p.stateTimer = 1.6
      p.neckHits = 0
    }
    return
  }
  if (p.state === 'RECOVER') {
    if (p.stateTimer <= 0) {
      p.state = 'STALK'
      p.repath = 0
    }
    return
  }

  /* Sound draws her round. This is the lever the player is meant to find:
     the herd is noisy, the rifle is noisy, and she will turn toward either. */
  if (p.lastSoundTimer > 0 && p.lastSoundAt) {
    const want = headingOf(p.lastSoundAt.x - p.pos.x, p.lastSoundAt.z - p.pos.z)
    p.heading = approachAngle(p.heading, want, OLD_ONE_EYE.turnRate * OLD_ONE_EYE.soundTurnBoost * dt)
  }

  switch (p.state) {
    case 'STALK': {
      p.repath -= dt
      if (p.repath <= 0 || !targetOf(world, p)) {
        const t = pickHerdTarget(world, p)
        p.targetId = t ? t.id : -1
        p.repath = 1.6
      }
      const t = targetOf(world, p)
      if (!t) {
        // No head left to hunt. She loses interest and walks off.
        p.state = 'FLEE'
        p.stateTimer = 20
        return
      }
      // She only tracks what she can see. Stand in the blind cone and she keeps
      // walking past you toward the herd.
      seek(p, t.pos.x, t.pos.z, OLD_ONE_EYE.speed, OLD_ONE_EYE.turnRate, dt)
      if (dist2(p.pos, t.pos) < OLD_ONE_EYE.lungeRange + 3) {
        p.state = 'TELEGRAPH'
        p.stateTimer = OLD_ONE_EYE.telegraph
        world.events.push({ t: 'roar', at: { ...p.pos }, kind: 'oldoneeye' })
      }
      break
    }
    case 'TELEGRAPH': {
      const t = targetOf(world, p)
      if (t) p.heading = approachAngle(p.heading, headingOf(t.pos.x - p.pos.x, t.pos.z - p.pos.z), 1.1 * dt)
      p.vel.x *= 1 - Math.min(1, dt * 4)
      p.vel.z *= 1 - Math.min(1, dt * 4)
      if (p.stateTimer <= 0) {
        p.state = 'LUNGE'
        p.stateTimer = 0.8
      }
      break
    }
    case 'LUNGE': {
      const t = targetOf(world, p)
      p.vel.x = Math.sin(p.heading) * OLD_ONE_EYE.speed * 1.7
      p.vel.z = Math.cos(p.heading) * OLD_ONE_EYE.speed * 1.7
      if (t && dist2(p.pos, t.pos) < p.radius + HERD.radius * t.scale + 2) {
        beginGrab(world, p, t, OLD_ONE_EYE.dragDuration)
        return
      }
      if (p.stateTimer <= 0) {
        p.state = 'STALK'
        p.repath = 0
      }
      break
    }
    case 'GRAB':
      stepDrag(world, p, dt, 6.4)
      break
    case 'FLEE':
      stepFlee(world, p, dt, OLD_ONE_EYE.speed)
      break
    default:
      p.state = 'STALK'
  }
}

/** True when the player is standing where she cannot see him. */
export function playerIsBlindside(world: World, p: Predator): boolean {
  return isInBlindCone(p, world.player.pos)
}

/* ------------------------------------------------------------ integration */

function integratePredator(world: World, p: Predator, dt: number): void {
  const t = world.terrain
  p.pos.x += p.vel.x * dt
  p.pos.z += p.vel.z * dt

  if (p.kind !== 'pteranodon') {
    const speedFactor = t.speedFactor(p.pos.x, p.pos.z)
    if (speedFactor < 1) {
      p.vel.x *= 1 - (1 - speedFactor) * Math.min(1, dt * 3)
      p.vel.z *= 1 - (1 - speedFactor) * Math.min(1, dt * 3)
    }
    // The crocodilian sits low in the water; everything else floats normally.
    p.pos.y = t.standHeight(p.pos.x, p.pos.z, p.kind === 'phobosuchus' ? 0.35 : 1.6 * p.scale)
  }

  p.gait += len2(p.vel.x, p.vel.z) * dt * (p.kind === 'raptor' ? 1.6 : 0.55)

  if (!t.inBounds(p.pos.x, p.pos.z)) {
    if (p.state === 'FLEE') p.alive = false
    else {
      p.pos.x = clamp(p.pos.x, t.def.bounds.minX + 4, t.def.bounds.maxX - 4)
      p.pos.z = clamp(p.pos.z, t.def.bounds.minZ + 4, t.def.bounds.maxZ - 4)
    }
  }
}
