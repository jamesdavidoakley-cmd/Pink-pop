/**
 * The herd.
 *
 * This is the game. Everything else in the build exists to pull the player away
 * from this system for a few seconds at a time and make them pay for it.
 *
 * Two ideas carry the whole thing:
 *
 *  - The leader trick. Followers weight cohesion toward the matriarch, not the
 *    herd centroid. Steering twelve independent animals is misery; steering one
 *    and watching eleven trail after her is a pleasure. So the player only ever
 *    has to solve a one-body problem, while the screen shows a twelve-body one.
 *
 *  - Panic is contagious and slow to undo. One rex ignored for eight seconds
 *    costs the whole formation, and the only way back is the whoop and standing
 *    still — which is exactly the thing combat stops you doing.
 */

import { HERD, WHOOP } from '@/core/tuning'
import {
  approachAngle,
  clamp,
  dist2,
  distSq2,
  headingOf,
  len2,
  lerp,
  smoothstep,
  type V3,
} from '@/core/math'
import type { Obstacle } from '@/world/terrain'
import type { HerdAnimal, HerdMood, HerdState, Predator, World } from './types'

/** Scratch vectors, reused every tick so the hot loop allocates nothing. */
const scratchObstacles: Obstacle[] = []

/** Predators that actually frighten anything. A sleeping rex is furniture. */
export function isThreatening(p: Predator): boolean {
  if (!p.alive) return false
  return p.state !== 'DOWN' && p.state !== 'HIDDEN'
}

/** How much dread this predator radiates, and over what distance. */
function fearProfile(p: Predator): { radius: number; drain: number } {
  switch (p.kind) {
    case 'raptor':
      // Cannot take an animal on its own, but is the best panic dealer in the game.
      return { radius: 18, drain: 22 }
    case 'pteranodon':
      return { radius: 20, drain: 16 }
    case 'phobosuchus':
      return { radius: 16, drain: 20 }
    case 'bighungry':
      return { radius: 34, drain: 26 }
    case 'oldoneeye':
      return { radius: 34, drain: 30 }
    default:
      return { radius: HERD.calm.predatorRadius, drain: HERD.calm.predatorDrain }
  }
}

export function livingHerd(world: World): HerdAnimal[] {
  return world.herd.filter((a) => !a.lost && !a.delivered)
}

export function findMatriarch(world: World): HerdAnimal | null {
  for (const a of world.herd) {
    if (a.matriarch && !a.lost && !a.delivered) return a
  }
  return null
}

/**
 * If the matriarch is taken, the herd needs a new one or it simply dissolves.
 * The calmest adult takes over — and the handover is announced, because from
 * the player's side it looks like the marker jumping to a different animal.
 */
function ensureMatriarch(world: World): HerdAnimal | null {
  let m = findMatriarch(world)
  if (m) return m
  let best: HerdAnimal | null = null
  for (const a of world.herd) {
    if (a.lost || a.delivered || a.juvenile) continue
    if (!best || a.calm > best.calm) best = a
  }
  if (!best) {
    // Nothing but juveniles left. One of them has to lead.
    for (const a of world.herd) {
      if (a.lost || a.delivered) continue
      if (!best || a.calm > best.calm) best = a
    }
  }
  if (best) {
    best.matriarch = true
    best.scale = best.juvenile ? HERD.juvenileScale : 1.22
    world.events.push({ t: 'toast', text: 'The herd has a new lead. Mind her.' })
    m = best
  }
  return m
}

/** Instantly restore calm in a radius, and cut any bolt short. The whoop. */
export function applyWhoop(world: World, at: V3): void {
  for (const a of world.herd) {
    if (a.lost || a.delivered) continue
    const d = dist2(a.pos, at)
    if (d > WHOOP.radius) continue
    a.calm = clamp(a.calm + HERD.calm.whoopRestore, 0, HERD.calm.max)
    a.whoopTimer = WHOOP.duration
    // A bolting animal that hears the boss and has calmed enough pulls up.
    // Without this the whoop could not recover a stampede, and it must.
    if (a.state === 'PANICKED' && a.calm >= HERD.calm.panicThreshold + 5) {
      a.state = 'SKITTISH'
      a.panicTimer = 0
    }
  }
}

/** Knock calm off every animal within radius. Gunfire, thunder, the boomer. */
export function shockHerd(world: World, at: V3 | null, radius: number, amount: number): void {
  for (const a of world.herd) {
    if (a.lost || a.delivered) continue
    if (at && dist2(a.pos, at) > radius) continue
    a.calm = clamp(a.calm - amount * (a.juvenile ? HERD.calm.juvenileDrainScale : 1), 0, HERD.calm.max)
  }
}

/* --------------------------------------------------------------- The tick */

export function stepHerd(world: World, dt: number): void {
  const matriarch = ensureMatriarch(world)
  const alive = livingHerd(world)
  if (alive.length === 0) {
    world.mood = 'GRAZING'
    world.herdCalmAverage = 0
    return
  }

  const player = world.player
  const drainScale = world.difficulty.calmDrainScale
  const leash = world.difficulty.stragglerLeash

  // Centroid first — the matriarch steers by it, and the HUD needs it anyway.
  let cx = 0
  let cz = 0
  for (const a of alive) {
    cx += a.pos.x
    cz += a.pos.z
  }
  cx /= alive.length
  cz /= alive.length
  world.herdCentroid.x = cx
  world.herdCentroid.z = cz
  world.herdCentroid.y = world.terrain.height(cx, cz)

  const threats = world.predators.filter(isThreatening)

  let calmSum = 0
  let panickedCount = 0
  let speedSum = 0

  for (const a of alive) {
    if (a.grabbedBy !== null) {
      // Being dragged. It has no say in where it is going.
      a.calm = 0
      a.state = 'PANICKED'
      panickedCount++
      continue
    }

    updateCalm(world, a, threats, alive, dt, drainScale)

    /* -------- panic: the state that overrides everything else it touches */

    if (a.state !== 'PANICKED' && a.calm < HERD.calm.panicThreshold) {
      a.state = 'PANICKED'
      a.panicTimer = HERD.calm.panicDuration
      const threat = nearestThreatPos(a, threats, player.pos)
      // "bolts in a straight line away from the nearest threat"
      let dx = a.pos.x - threat.x
      let dz = a.pos.z - threat.z
      const l = len2(dx, dz) || 1
      dx /= l
      dz /= l
      a.panicDir.x = dx
      a.panicDir.z = dz
      if (panickedCount === 0) world.events.push({ t: 'stampede' })
    }

    if (a.state === 'PANICKED') {
      a.panicTimer -= dt
      panickedCount++
      if (a.panicTimer <= 0) {
        a.state = 'SKITTISH'
        // Give it a floor above the threshold, or it re-panics on the same frame
        // and the herd can never be recovered — which would break the design.
        a.calm = Math.max(a.calm, HERD.calm.panicThreshold + 8)
      }
    }

    /* ------------------------------------------------------- straggling */

    const distToLead = matriarch && matriarch !== a ? dist2(a.pos, matriarch.pos) : 0
    if (matriarch && matriarch !== a) {
      if (!a.straggler && distToLead > leash) {
        a.straggler = true
      } else if (a.straggler && distToLead < leash * 0.72) {
        // Hysteresis, so an animal on the boundary does not flicker.
        a.straggler = false
      }
    } else {
      a.straggler = false
    }

    /* ------------------------------------------------------ what it wants */

    a.moveHold = Math.max(0, a.moveHold - dt)
    if (a.state !== 'PANICKED') {
      const reason = travelReason(world, a, matriarch, threats)
      if (reason) {
        a.state = reason
        // Momentum is refreshed by a *reason* to travel, never by the fact that
        // the animal is already travelling — otherwise the hold feeds itself and
        // an unattended herd walks off the map at two metres a second.
        a.moveHold = MOVE_HOLD
      } else {
        a.state = a.moveHold > 0 ? 'MOVING' : 'GRAZING'
      }
    }

    /* --------------------------------------------------------- steering */

    const desired = steer(world, a, alive, matriarch, threats)
    // Weak forces produce a slow amble, strong ones a committed trot.
    const speed =
      desiredSpeed(world, a) * (a.state === 'PANICKED' ? 1 : Math.max(0.3, desired.urgency))

    const targetVx = desired.x * speed
    const targetVz = desired.z * speed
    const accel = a.state === 'PANICKED' ? HERD.accel * 2.2 : HERD.accel
    a.vel.x += (targetVx - a.vel.x) * Math.min(1, accel * dt)
    a.vel.z += (targetVz - a.vel.z) * Math.min(1, accel * dt)

    integrate(world, a, dt)

    const sp = len2(a.vel.x, a.vel.z)
    a.speedSmoothed = lerp(a.speedSmoothed, sp, Math.min(1, dt * 8))
    speedSum += sp

    a.gait += sp * dt * (a.juvenile ? 1.5 : 0.9)
    if (a.whoopTimer > 0) a.whoopTimer -= dt
    calmSum += a.calm
  }

  world.herdCalmAverage = calmSum / alive.length
  const avgSpeed = speedSum / alive.length

  /* ----------------------------------------------- herd-level read-out */

  const stampedeThreshold = Math.max(2, Math.ceil(alive.length * 0.25))
  let mood: HerdMood
  if (panickedCount >= stampedeThreshold) mood = 'STAMPEDING'
  else if (world.herdCalmAverage < HERD.skittishCalm || panickedCount > 0) mood = 'SKITTISH'
  else if (avgSpeed > 1.6) mood = 'MOVING'
  else mood = 'GRAZING'

  if (mood === 'STAMPEDING') {
    world.stampedeTimer += dt
    world.shake = Math.max(world.shake, 0.5)
  } else if (world.stampedeTimer > 0) {
    world.stampedeTimer = Math.max(0, world.stampedeTimer - dt * 2)
  }
  world.mood = mood
}

/** How long travelling momentum outlives the reason for it. */
const MOVE_HOLD = 2.5

/** How far a follower will let the matriarch get before it bestirs itself. */
const FOLLOW_COMFORT = 13

/**
 * Is there an active reason for this animal to be doing something other than
 * eating? Returns the state that reason implies, or null for "no reason".
 *
 * Deciding this *before* steering, rather than reading it back off the
 * resulting speed, matters: the other way round is circular, and a grazing
 * animal can never talk itself into moving.
 */
function travelReason(
  world: World,
  a: HerdAnimal,
  matriarch: HerdAnimal | null,
  threats: Predator[],
): HerdState | null {
  // Heads swivelling, stamping, amber bar. Nerves override everything below.
  if (a.calm < HERD.skittishCalm) return 'SKITTISH'
  for (const p of threats) {
    if (distSq2(a.pos, p.pos) < HERD.radii.predator * HERD.radii.predator) return 'SKITTISH'
  }

  // A straggler has stopped believing in the herd. It grazes where it stands.
  if (a.straggler) return 'GRAZING'

  if (a.whoopTimer > 0) return 'MOVING'

  // Being shoved by the trail boss. This is the push that drives the whole game.
  if (distSq2(a.pos, world.player.pos) < HERD.radii.player * HERD.radii.player) return 'MOVING'

  if (matriarch && matriarch !== a) {
    if (dist2(a.pos, matriarch.pos) > FOLLOW_COMFORT) return 'MOVING'
    if (matriarch.speedSmoothed > 1.4) return 'MOVING'
  }

  return null
}

/* ------------------------------------------------------------------ calm */

function updateCalm(
  world: World,
  a: HerdAnimal,
  threats: Predator[],
  alive: HerdAnimal[],
  dt: number,
  drainScale: number,
): void {
  const c = HERD.calm
  const juvenile = a.juvenile ? c.juvenileDrainScale : 1

  /* Predators. Summing linearly makes a five-strong raptor pack instantly
     lethal to morale, which is not the lesson that level wants to teach. The
     nearest threat counts in full and the rest are discounted. */
  let biggest = 0
  let rest = 0
  for (const p of threats) {
    const prof = fearProfile(p)
    const d = dist2(a.pos, p.pos)
    if (d > prof.radius) continue
    const contribution = prof.drain * (1 - d / prof.radius)
    if (contribution > biggest) {
      rest += biggest
      biggest = contribution
    } else {
      rest += contribution
    }
  }
  let drain = biggest + rest * 0.35

  /* Panic is contagious: "an animal within 10m of a panicked animal loses 10
     calm per second". This is the stampede system. */
  let panickedNear = 0
  for (const other of alive) {
    if (other === a || other.state !== 'PANICKED') continue
    if (distSq2(a.pos, other.pos) < c.contagionRadius * c.contagionRadius) panickedNear++
  }
  if (panickedNear > 0) {
    drain += c.contagionDrain * Math.min(1 + 0.3 * (panickedNear - 1), 2)
  }

  /* The edge of the world, and the edge of Bone Gulch. */
  if (world.terrain.isCliffEdge(a.pos.x, a.pos.z)) drain += c.cliffDrain

  drain *= juvenile * drainScale

  /* Reagan, standing there being reassuring. Sprinting past at ten metres a
     second is not reassuring, which is why the sprint is nearly worthless here.
     Neither is working the rifle — and that exclusion is what makes the brief's
     central claim true, that a player who stands still and shoots everything
     finishes with fewer head than one who never fires at all. */
  let restore = 0
  const dp = dist2(a.pos, world.player.pos)
  const shooting = world.player.gunHeat > 0
  if (dp < c.reaganRadius && !world.player.onBike && !shooting) {
    const falloff = 1 - dp / c.reaganRadius
    const calmer = world.upgrades.herdCalmer ? 2 : 1
    restore = c.reaganRestore * falloff * calmer * (world.player.sprinting ? c.reaganSprintScale : 1)
  }
  // Nor does an animal settle back down while the shooting is still going on
  // near enough to hear.
  const inEarshot = shooting && dp < c.gunshotRadius * 1.6
  if (drain <= 0.01 && !inEarshot) restore += c.idleRestore

  a.calm = clamp(a.calm + (restore - drain) * dt, 0, c.max)
}

function nearestThreatPos(a: HerdAnimal, threats: Predator[], playerPos: V3): V3 {
  let best: V3 = playerPos
  let bestD = Infinity
  for (const p of threats) {
    const d = distSq2(a.pos, p.pos)
    if (d < bestD) {
      bestD = d
      best = p.pos
    }
  }
  // If nothing is hunting, the thing it is running from is the trail boss.
  if (bestD === Infinity) return playerPos
  return best
}

/* -------------------------------------------------------------- steering */

interface Steer {
  x: number
  z: number
  /**
   * How badly the animal wants to go that way, 0..1. Desired speed is scaled by
   * it, so a grazing animal ambles and an animal being shoved by the trail boss
   * actually shifts. Without this every state moves at its full speed in
   * whatever direction the forces happened to sum to, and the herd jitters.
   */
  urgency: number
}

function steer(
  world: World,
  a: HerdAnimal,
  alive: HerdAnimal[],
  matriarch: HerdAnimal | null,
  threats: Predator[],
): Steer {
  // A bolting animal is not steering. That is the whole point of a bolt: it
  // ignores cohesion, ignores obstacles, and runs straight at whatever is in
  // front of it — including, on Bone Gulch, a sixty metre drop.
  if (a.state === 'PANICKED') {
    return { x: a.panicDir.x, z: a.panicDir.z, urgency: 1 }
  }

  const W = HERD.weights
  const R = HERD.radii
  let sx = 0
  let sz = 0

  /* separation ------------------------------------------------------- 1.5 */
  let sepX = 0
  let sepZ = 0
  for (const other of alive) {
    if (other === a) continue
    const dx = a.pos.x - other.pos.x
    const dz = a.pos.z - other.pos.z
    const d2 = dx * dx + dz * dz
    const r = R.separation * (a.scale + other.scale) * 0.5
    if (d2 > r * r || d2 < 1e-5) continue
    const d = Math.sqrt(d2)
    sepX += (dx / d) * (1 - d / r)
    sepZ += (dz / d) * (1 - d / r)
  }
  sx += sepX * W.separation
  sz += sepZ * W.separation

  /* cohesion and alignment — dropped entirely once an animal has given up */
  if (!a.straggler) {
    /* cohesion ------------------------------- 1.0 centroid / 2.5 matriarch */
    let tx: number
    let tz: number
    let cohWeight: number
    let comfort: number
    if (matriarch && matriarch !== a && !matriarch.lost) {
      // The leader trick. Push her and the herd comes with her.
      tx = matriarch.pos.x
      tz = matriarch.pos.z
      cohWeight = W.cohesionMatriarch
      comfort = HERD.radius * 3.2 * a.scale
    } else {
      /* The matriarch keeps only a loose tie to the body of the herd. If she
         held the herd centroid as tightly as her followers hold her, every
         shove the player gave her would be cancelled by eleven animals pulling
         the other way — and the leader trick, which is the entire game, would
         not work. She leads; she does not follow. */
      tx = world.herdCentroid.x
      tz = world.herdCentroid.z
      cohWeight = W.cohesion
      comfort = 15
    }
    const dx = tx - a.pos.x
    const dz = tz - a.pos.z
    const d = len2(dx, dz)
    if (d > 1e-3) {
      /* Full weight once the target is further off than a comfortable spacing,
         rather than ramping in slowly across the whole cohesion radius. A soft
         ramp means followers trail at a fraction of her speed and the herd
         smears out behind her instead of moving as a body. */
      const pull = smoothstep(comfort, comfort + 7, d)
      sx += (dx / d) * cohWeight * pull
      sz += (dz / d) * cohWeight * pull
    }

    /* alignment ------------------------------------------------------ 0.8 */
    let ax = 0
    let az = 0
    let n = 0
    for (const other of alive) {
      if (other === a) continue
      if (distSq2(a.pos, other.pos) > R.alignment * R.alignment) continue
      ax += other.vel.x
      az += other.vel.z
      n++
    }
    if (n > 0) {
      const l = len2(ax, az)
      if (l > 0.4) {
        sx += (ax / l) * W.alignment
        sz += (az / l) * W.alignment
      }
    }
  }

  /* repulsion from Reagan ------------------------ 2.0, radius 8m ---------- */
  {
    const dx = a.pos.x - world.player.pos.x
    const dz = a.pos.z - world.player.pos.z
    const d = len2(dx, dz)
    // On the bike he is louder and pushier — good for stragglers, bad for the herd.
    const radius = world.player.onBike ? R.player * 1.5 : R.player
    if (d < radius && d > 1e-3) {
      const push = W.repulsionPlayer * (1 - d / radius) * (world.player.onBike ? 1.4 : 1)
      sx += (dx / d) * push
      sz += (dz / d) * push
    }
  }

  /* repulsion from predators --------------------- 4.0, radius 25m -------- */
  for (const p of threats) {
    const dx = a.pos.x - p.pos.x
    const dz = a.pos.z - p.pos.z
    const d = len2(dx, dz)
    if (d < R.predator && d > 1e-3) {
      const push = W.repulsionPredator * (1 - d / R.predator)
      sx += (dx / d) * push
      sz += (dz / d) * push
    }
  }

  /* the whoop ------------------------------------------------------- 5.0 */
  if (a.whoopTimer > 0) {
    const dx = world.player.pos.x - a.pos.x
    const dz = world.player.pos.z - a.pos.z
    const d = len2(dx, dz)
    /* Only animals that have actually drifted get hauled in. Otherwise the
       gather call doubles as a leash and drags the herd backwards up the trail
       every time you use it, which makes the most useful button in the game
       actively bad to press. */
    if (d > 9) {
      // Must out-weigh predator repulsion or the gather call is useless in the
      // exact situation you need it: a rex on the far side of the herd.
      sx += (dx / d) * WHOOP.weight
      sz += (dz / d) * WHOOP.weight
    }
  }

  /* grazing --------------------------------------------------------- 0.5 */
  if (a.state === 'GRAZING' || a.straggler) {
    a.grazeRetarget -= 1 / 60
    if (a.grazeRetarget <= 0) {
      const r = world.rng
      a.grazeTarget.x = a.pos.x + r.range(-R.graze, R.graze)
      a.grazeTarget.z = a.pos.z + r.range(-R.graze, R.graze)
      a.grazeRetarget = r.range(3, 7)
    }
    const dx = a.grazeTarget.x - a.pos.x
    const dz = a.grazeTarget.z - a.pos.z
    const d = len2(dx, dz)
    if (d > 1.5) {
      sx += (dx / d) * W.grazeAttraction
      sz += (dz / d) * W.grazeAttraction
    }
  }

  /* obstacles and edges ---------------------------------------------- 3.0 */
  const obstacles = world.terrain.obstaclesNear(a.pos.x, a.pos.z, R.obstacle + 4, scratchObstacles)
  for (const o of obstacles) {
    const dx = a.pos.x - o.x
    const dz = a.pos.z - o.z
    const d = len2(dx, dz)
    const r = o.radius + HERD.radius * a.scale + 1.5
    if (d < r && d > 1e-3) {
      sx += (dx / d) * W.obstacleAvoidance * (1 - d / r)
      sz += (dz / d) * W.obstacleAvoidance * (1 - d / r)
    }
  }

  // A calm animal will not walk off a cliff or out of the world. A panicked one
  // will, because it returned early and never reached this code.
  const edge = edgeAvoidance(world, a)
  sx += edge.x * W.obstacleAvoidance
  sz += edge.z * W.obstacleAvoidance

  const l = len2(sx, sz)
  if (l < 1e-4) return { x: 0, z: 0, urgency: 0 }
  /* A force of ~1.8 counts as full commitment. That is roughly what Reagan's
     shove is worth at three metres, so getting right up behind an animal moves
     it properly and hanging back at the edge of the radius only nudges it. */
  return { x: sx / l, z: sz / l, urgency: clamp(l / 1.8, 0, 1) }
}

/** Steer back toward the trail when the ground ahead stops being ground. */
function edgeAvoidance(world: World, a: HerdAnimal): { x: number; z: number } {
  const t = world.terrain
  const probe = 6
  const here = t.height(a.pos.x, a.pos.z)
  let x = 0
  let z = 0
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2
    const px = a.pos.x + Math.sin(ang) * probe
    const pz = a.pos.z + Math.cos(ang) * probe
    const drop = here - t.height(px, pz)
    if (drop > 3.5 || !t.inBounds(px, pz)) {
      const strength = clamp(drop / 8, 0.5, 1.6)
      x -= Math.sin(ang) * strength
      z -= Math.cos(ang) * strength
    }
  }
  return { x, z }
}

function desiredSpeed(world: World, a: HerdAnimal): number {
  const S = HERD.speed
  let base: number
  if (a.state === 'PANICKED') base = S.panic
  else if (a.straggler) base = S.graze
  else if (a.state === 'GRAZING') base = S.graze
  else if (a.state === 'SKITTISH') base = S.skittish
  else base = S.move
  if (a.whoopTimer > 0 && a.state !== 'PANICKED') base = Math.max(base, S.move)
  const kindScale = a.matriarch ? S.matriarchScale : a.juvenile ? S.juvenileScale : 1
  return base * kindScale * world.terrain.speedFactor(a.pos.x, a.pos.z)
}

/* ----------------------------------------------------------- integration */

function integrate(world: World, a: HerdAnimal, dt: number): void {
  const t = world.terrain
  const nx = a.pos.x + a.vel.x * dt
  const nz = a.pos.z + a.vel.z * dt

  a.pos.x = nx
  a.pos.z = nz

  // Push out of anything solid rather than stopping dead against it.
  const obstacles = t.obstaclesNear(a.pos.x, a.pos.z, 8, scratchObstacles)
  for (const o of obstacles) {
    const dx = a.pos.x - o.x
    const dz = a.pos.z - o.z
    const d = len2(dx, dz)
    const r = o.radius + HERD.radius * a.scale * 0.6
    if (d < r && d > 1e-4) {
      const push = (r - d) / d
      a.pos.x += dx * push
      a.pos.z += dz * push
    }
  }

  a.pos.y = t.height(a.pos.x, a.pos.z)

  const sp = len2(a.vel.x, a.vel.z)
  if (sp > 0.05) {
    const target = headingOf(a.vel.x, a.vel.z)
    a.heading = approachAngle(a.heading, target, HERD.turnRate * dt * (a.state === 'PANICKED' ? 2 : 1))
  }

  /* -------- the two ways the trail takes an animal off you for good ------ */

  if (!t.inBounds(a.pos.x, a.pos.z)) {
    loseAnimal(world, a, 'strayed')
    return
  }
  if (t.fallDepth(a.pos.x, a.pos.z) > 14) {
    loseAnimal(world, a, 'fell')
  }
}

/**
 * Nothing dies in this game. An animal that is "lost" wanders off the map
 * bleating and is written off by the Controller as a logistics line item.
 */
export function loseAnimal(world: World, a: HerdAnimal, reason: 'taken' | 'strayed' | 'fell'): void {
  if (a.lost || a.delivered) return
  a.lost = true
  a.grabbedBy = null
  world.stats.headLost++
  if (reason === 'strayed') world.stats.stragglersLost++
  world.events.push({ t: 'head_lost', at: { ...a.pos }, animal: a.id, reason })
  const line =
    reason === 'taken'
      ? 'One head off the count. Trans-Time has been notified.'
      : reason === 'fell'
        ? 'One head over the edge. That one is not coming back.'
        : 'One head strayed off the drive. Written off.'
  world.events.push({ t: 'toast', text: line })
  if (world.difficulty.permadeath && world.phase === 'playing') {
    world.phase = 'failed'
    world.events.push({ t: 'failed' })
  }
}
