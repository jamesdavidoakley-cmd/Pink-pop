/**
 * Weapons.
 *
 * The design constraint that governs this file: the rifle is deliberately not a
 * solution. It cannot kill, it takes three hits to put anything down, and it
 * costs calm on every animal within fifteen metres of the muzzle. A player who
 * stands still and shoots everything should finish the drive with fewer head
 * than a player who never fires at all. Everything here is tuned to make that
 * true rather than to make shooting satisfying at the herd's expense.
 */

import { GOAD, HERD, NET_GUN, OLD_ONE_EYE, RIFLE, SONIC_BOOMER, WHOOP } from '@/core/tuning'
import { angleDelta, clamp, dist2, headingOf, len2, type V3 } from '@/core/math'
import { applyWhoop, isThreatening, shockHerd } from './herd'
import { SPOOK_SECONDS } from './predators'
import type { Predator, World } from './types'

export type HitPart = 'body' | 'head' | 'neck'

interface RayHit {
  predator: Predator
  part: HitPart
  point: V3
  distance: number
}

/** Ray/sphere, returning the near intersection distance or null. */
function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
): number | null {
  const lx = cx - ox
  const ly = cy - oy
  const lz = cz - oz
  const tca = lx * dx + ly * dy + lz * dz
  if (tca < 0) return null
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca
  const r2 = r * r
  if (d2 > r2) return null
  const thc = Math.sqrt(r2 - d2)
  const t0 = tca - thc
  return t0 >= 0 ? t0 : tca + thc
}

/** Body, neck and head volumes for one predator, in world space. */
function hitVolumes(p: Predator): { part: HitPart; x: number; y: number; z: number; r: number }[] {
  const s = p.scale
  const fx = Math.sin(p.heading)
  const fz = Math.cos(p.heading)
  const bodyH = headHeightFor(p) * 0.55
  const out: { part: HitPart; x: number; y: number; z: number; r: number }[] = [
    { part: 'body', x: p.pos.x, y: p.pos.y + bodyH, z: p.pos.z, r: p.radius * 1.05 },
  ]
  if (p.kind === 'rex' || p.kind === 'oldoneeye' || p.kind === 'bighungry') {
    // Matched by hand to where the rig actually puts the skull. If these drift
    // apart the player shoots what they can see and hits nothing, which on the
    // Old One Eye fight would make the neck window unusable.
    const reach = p.radius * 1.75
    const headY = p.pos.y + headHeightFor(p)
    out.push({
      part: 'neck',
      x: p.pos.x + fx * reach * 0.55,
      y: p.pos.y + headHeightFor(p) * 0.82,
      z: p.pos.z + fz * reach * 0.55,
      r: 0.62 * s,
    })
    out.push({ part: 'head', x: p.pos.x + fx * reach, y: headY, z: p.pos.z + fz * reach, r: 0.95 * s })
  } else {
    out.push({
      part: 'head',
      x: p.pos.x + fx * p.radius * 1.2,
      y: p.pos.y + headHeightFor(p),
      z: p.pos.z + fz * p.radius * 1.2,
      r: 0.55 * s,
    })
  }
  return out
}

/**
 * Where the exposed neck actually is, in world space.
 *
 * Exported because the rig, the hit volumes and the tests all have to agree
 * about it. When they drifted apart, shooting the neck the player could plainly
 * see hit nothing, and the Old One Eye fight became unwinnable for reasons
 * invisible on screen.
 */
export function neckPoint(p: Predator): V3 {
  const reach = p.radius * 1.75
  return {
    x: p.pos.x + Math.sin(p.heading) * reach * 0.55,
    y: p.pos.y + headHeightFor(p) * 0.82,
    z: p.pos.z + Math.cos(p.heading) * reach * 0.55,
  }
}

export function headHeightFor(p: Predator): number {
  switch (p.kind) {
    case 'rex':
      return 4.2 * p.scale
    case 'oldoneeye':
      return 4.2 * p.scale
    case 'raptor':
      return 1.6 * p.scale
    case 'pteranodon':
      return 1.2 * p.scale
    case 'phobosuchus':
      return 0.7 * p.scale
    case 'bighungry':
      return 5.5 * p.scale
    default:
      return 2 * p.scale
  }
}

export function raycastPredators(
  world: World,
  origin: V3,
  dirX: number,
  dirY: number,
  dirZ: number,
  range: number,
): RayHit | null {
  let best: RayHit | null = null
  for (const p of world.predators) {
    if (!p.alive || p.state === 'HIDDEN') continue
    // Flyers sit at altitude; everything else is on the deck.
    for (const vol of hitVolumes(p)) {
      const t = raySphere(origin.x, origin.y, origin.z, dirX, dirY, dirZ, vol.x, vol.y, vol.z, vol.r)
      if (t === null || t > range) continue
      if (best && t >= best.distance) continue
      best = {
        predator: p,
        part: vol.part,
        distance: t,
        point: { x: origin.x + dirX * t, y: origin.y + dirY * t, z: origin.z + dirZ * t },
      }
    }
  }
  return best
}

/* ------------------------------------------------------------ stun rifle */

export function fireRifle(world: World): void {
  const p = world.player
  if (p.ammo <= 0 || p.fireTimer > 0) return

  p.ammo--
  p.fireTimer = RIFLE.fireInterval
  p.rechargeTimer = RIFLE.rechargeDelay
  p.gunHeat = HERD.calm.gunHeatSeconds
  world.stats.shotsFired++

  const origin: V3 = { x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z }
  // Hip fire wanders; aiming down the sights does not.
  const spread = p.aiming ? 0 : RIFLE.hipSpread
  const jitterYaw = spread === 0 ? 0 : world.rng.range(-spread, spread)
  const jitterPitch = spread === 0 ? 0 : world.rng.range(-spread, spread)
  const yaw = p.aimYaw + jitterYaw
  const pitch = p.aimPitch + jitterPitch
  const cp = Math.cos(pitch)
  const dx = Math.sin(yaw) * cp
  const dy = Math.sin(pitch)
  const dz = Math.cos(yaw) * cp

  const hit = raycastPredators(world, origin, dx, dy, dz, RIFLE.range)
  const end: V3 = hit
    ? hit.point
    : { x: origin.x + dx * RIFLE.range, y: origin.y + dy * RIFLE.range, z: origin.z + dz * RIFLE.range }

  world.events.push({ t: 'shot', from: origin, to: end, hit: !!hit })

  /* The cost of pulling the trigger, paid whether or not you hit anything.
     This is what makes sniping from a distance better play than firing from
     inside the herd, and it is the single most important line in the file. */
  shockHerd(world, origin, HERD.calm.gunshotRadius, HERD.calm.gunshotCost)

  // Every shot is a noise, and Old One Eye hunts by ear.
  for (const pred of world.predators) {
    if (pred.kind === 'oldoneeye' && pred.alive) {
      pred.lastSoundAt = { ...origin }
      pred.lastSoundTimer = 2.5
    }
  }

  if (hit) applyRifleHit(world, hit)
}

function applyRifleHit(world: World, hit: RayHit): void {
  const p = hit.predator
  const headshot = hit.part === 'head'
  world.events.push({ t: 'hit', at: hit.point, predator: p.id, headshot })

  if (p.kind === 'oldoneeye') {
    applyOldOneEyeHit(world, p, hit.part)
    return
  }

  if (p.kind === 'bighungry') {
    // The nothosaur only takes hits on the rise, when its neck is out of the water.
    if (p.state === 'SUBMERGED') {
      world.events.push({ t: 'toast', text: 'The shot goes into the water. Wait for it to come up.' })
      return
    }
    p.hits += headshot ? RIFLE.headshotMultiplier : 1
    p.hitWindow = RIFLE.comboWindow
    if (p.hits >= 3) {
      p.hits = 0
      p.staggers++
      p.state = 'STAGGERED'
      p.stateTimer = 3
      world.events.push({ t: 'boss_stagger', at: { ...p.pos }, remaining: 3 - p.staggers })
      if (p.staggers >= 3) downPredator(world, p, 999)
    }
    return
  }

  if (p.state === 'DOWN') return

  // Shooting a rex that has hold of an animal makes it let go. That is the
  // only situation in the game where the rifle is unambiguously the answer.
  if (p.state === 'GRAB') {
    releaseGrab(world, p)
  }

  p.hits += headshot ? RIFLE.headshotMultiplier : 1
  p.hitWindow = RIFLE.comboWindow

  if (p.hits >= world.difficulty.hitsToDrop) {
    downPredator(world, p, RIFLE.downDuration)
  } else {
    p.state = 'STAGGERED'
    p.stateTimer = Math.max(p.stateTimer, RIFLE.staggerDuration)
    world.events.push({ t: 'predator_stagger', at: { ...p.pos }, kind: p.kind })
  }
}

function applyOldOneEyeHit(world: World, p: Predator, part: HitPart): void {
  /* "Stun shots to her body do nothing." The discoverability rule from the
     acceptance tests means we must not print an instruction — but a visible,
     audible nothing, repeated, is itself the teaching signal, and the ricochet
     spark reads as "wrong target" without a word of tutorial. */
  if (p.state !== 'STAGGERED') {
    world.events.push({ t: 'predator_stagger', at: { ...p.pos }, kind: p.kind })
    return
  }
  if (part !== 'neck' && part !== 'head') return

  p.neckHits += part === 'head' ? 2 : 1
  if (p.neckHits >= 3) {
    p.neckHits = 0
    p.staggers++
    world.events.push({ t: 'boss_stagger', at: { ...p.pos }, remaining: 3 - p.staggers })
    if (p.staggers >= 3) {
      downPredator(world, p, 9999)
      world.events.push({ t: 'boss_down', at: { ...p.pos } })
    } else {
      p.state = 'RECOVER'
      p.stateTimer = 2.4
    }
  }
}

export function downPredator(world: World, p: Predator, duration: number): void {
  if (p.state === 'GRAB') releaseGrab(world, p)
  p.state = 'DOWN'
  p.stateTimer = duration
  p.hits = 0
  p.vel.x = 0
  p.vel.z = 0
  world.events.push({ t: 'predator_down', at: { ...p.pos }, kind: p.kind })
}

export function releaseGrab(world: World, p: Predator): void {
  if (p.targetId < 0) return
  const animal = world.herd.find((a) => a.id === p.targetId)
  if (animal && animal.grabbedBy === p.id) {
    animal.grabbedBy = null
    animal.calm = Math.max(animal.calm, 8)
    animal.state = 'PANICKED'
    animal.panicTimer = HERD.calm.panicDuration
    world.events.push({ t: 'freed', at: { ...animal.pos }, animal: animal.id })
    world.events.push({ t: 'toast', text: 'It dropped her. Get her back in the herd.' })
  }
  p.targetId = -1
}

/* ------------------------------------------------------------------ goad */

/**
 * A short, wide forward shove. Free, quiet, and the skill ceiling of the whole
 * game: a good player pushes rexes off the herd with this and never fires.
 */
export function useGoad(world: World): void {
  const p = world.player
  if (p.goadTimer > 0) return
  p.goadTimer = GOAD.cooldown

  const originY = p.pos.y + 1.2
  const at: V3 = {
    x: p.pos.x + Math.sin(p.heading) * 1.2,
    y: originY,
    z: p.pos.z + Math.cos(p.heading) * 1.2,
  }
  let connected = false

  for (const pred of world.predators) {
    if (!pred.alive || pred.state === 'DOWN' || pred.state === 'HIDDEN') continue
    if (pred.kind === 'pteranodon') continue // "Cannot be goaded."
    if (!inGoadArc(world, pred.pos)) continue

    if (pred.kind === 'oldoneeye') {
      connected = goadOldOneEye(world, pred) || connected
      continue
    }

    connected = true
    const dx = pred.pos.x - p.pos.x
    const dz = pred.pos.z - p.pos.z
    const d = len2(dx, dz) || 1
    // "knocks a rex back 6m" — as an impulse that decays, so it slides.
    const impulse = GOAD.knockbackPredator / 0.6
    pred.vel.x = (dx / d) * impulse
    pred.vel.z = (dz / d) * impulse
    if (pred.state === 'GRAB') releaseGrab(world, pred)
    pred.state = 'STAGGERED'
    pred.stateTimer = GOAD.staggerDuration
    // And then it keeps its distance for a while, which is the whole value of
    // the goad: five quiet seconds, no ammunition, and no calm off the herd.
    pred.spooked = SPOOK_SECONDS
    world.events.push({ t: 'predator_stagger', at: { ...pred.pos }, kind: pred.kind })
  }

  for (const a of world.herd) {
    if (a.lost || a.delivered || a.grabbedBy !== null) continue
    if (!inGoadArc(world, a.pos)) continue
    connected = true
    const dx = a.pos.x - p.pos.x
    const dz = a.pos.z - p.pos.z
    const d = len2(dx, dz) || 1
    const impulse = GOAD.knockbackHerd / 0.5
    a.vel.x = (dx / d) * impulse
    a.vel.z = (dz / d) * impulse
    a.calm = clamp(a.calm - GOAD.herdCalmCost, 0, HERD.calm.max)
    if (a.state === 'GRAZING') a.state = 'MOVING'
  }

  world.events.push({ t: 'goad', at, connected })
}

function inGoadArc(world: World, target: V3): boolean {
  const p = world.player
  const d = dist2(p.pos, target)
  if (d > GOAD.range + 2.2) return false
  const toTarget = headingOf(target.x - p.pos.x, target.z - p.pos.z)
  return Math.abs(angleDelta(p.heading, toTarget)) <= GOAD.arc
}

/**
 * Her whole fight lives here. A goad landed anywhere but her blind left flank
 * just makes her turn round; landed on the blind side it staggers her and opens
 * the neck. No text ever explains this — the player finds it because body shots
 * visibly do nothing and circling is the only thing left to try.
 */
function goadOldOneEye(world: World, p: Predator): boolean {
  const blind = isInBlindCone(p, world.player.pos)
  if (!blind) {
    // She felt that, and now she knows roughly where you are.
    p.lastSoundAt = { ...world.player.pos }
    p.lastSoundTimer = 3
    world.events.push({ t: 'predator_stagger', at: { ...p.pos }, kind: p.kind })
    return true
  }
  p.state = 'STAGGERED'
  p.stateTimer = 3.2
  p.neckHits = 0
  world.events.push({ t: 'predator_stagger', at: { ...p.pos }, kind: p.kind })
  world.shake = Math.max(world.shake, 0.8)
  return true
}

/**
 * True if `at` sits inside the 90-degree cone she cannot see out of.
 *
 * Forward is (sin h, 0, cos h) and up is +Y, so her left hand — up x forward —
 * points along +X, which is a relative bearing of +PI/2. That has to agree with
 * the rig, because the dead white eye on that side is the only thing that ever
 * tells the player the mechanic exists.
 */
export function isInBlindCone(p: Predator, at: V3): boolean {
  const toTarget = headingOf(at.x - p.pos.x, at.z - p.pos.z)
  const rel = angleDelta(p.heading, toTarget)
  const centre = OLD_ONE_EYE.blindSideSign * (Math.PI / 2)
  return Math.abs(angleDelta(centre, rel)) <= OLD_ONE_EYE.blindConeHalfAngle
}

/* -------------------------------------------------------------- the whoop */

export function useWhoop(world: World): void {
  const p = world.player
  if (p.whoopTimer > 0) return
  p.whoopTimer = WHOOP.cooldown
  p.whoopActive = WHOOP.duration
  applyWhoop(world, p.pos)
  world.events.push({ t: 'whoop', at: { ...p.pos } })
}

/* ----------------------------------------------------------- unlockables */

export function useNetGun(world: World): void {
  const p = world.player
  if (!world.upgrades.netGun || p.netTimer > 0) return
  p.netTimer = NET_GUN.cooldown

  const origin: V3 = { x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z }
  const cp = Math.cos(p.aimPitch)
  const hit = raycastPredators(
    world,
    origin,
    Math.sin(p.aimYaw) * cp,
    Math.sin(p.aimPitch),
    Math.cos(p.aimYaw) * cp,
    NET_GUN.range,
  )
  if (hit && hit.predator.kind !== 'oldoneeye' && hit.predator.kind !== 'bighungry') {
    hit.predator.state = 'ROOTED'
    hit.predator.stateTimer = NET_GUN.rootDuration
    hit.predator.vel.x = 0
    hit.predator.vel.z = 0
    if (hit.predator.targetId >= 0) releaseGrab(world, hit.predator)
  }
  world.events.push({ t: 'net', at: origin, hit: !!hit })
}

export function useSonicBoomer(world: World): void {
  const p = world.player
  if (!world.upgrades.sonicBoomer || p.boomerTimer > 0) return
  p.boomerTimer = SONIC_BOOMER.cooldown

  for (const pred of world.predators) {
    if (!isThreatening(pred)) continue
    const d = dist2(pred.pos, p.pos)
    if (d > SONIC_BOOMER.radius || d < 1e-3) continue
    const f = 1 - d / SONIC_BOOMER.radius
    pred.vel.x = ((pred.pos.x - p.pos.x) / d) * SONIC_BOOMER.push * f
    pred.vel.z = ((pred.pos.z - p.pos.z) / d) * SONIC_BOOMER.push * f
    if (pred.kind !== 'oldoneeye' && pred.kind !== 'bighungry') {
      if (pred.state === 'GRAB') releaseGrab(world, pred)
      pred.state = 'STAGGERED'
      pred.stateTimer = 1.2
    }
  }

  /* "also panics your own herd, so it is a panic button with a real cost" */
  for (const a of world.herd) {
    if (a.lost || a.delivered) continue
    const d = dist2(a.pos, p.pos)
    if (d > SONIC_BOOMER.radius) continue
    const f = 1 - d / SONIC_BOOMER.radius
    a.calm = clamp(a.calm - SONIC_BOOMER.herdCalmCost, 0, HERD.calm.max)
    if (d > 1e-3) {
      a.vel.x = ((a.pos.x - p.pos.x) / d) * SONIC_BOOMER.push * f * 0.7
      a.vel.z = ((a.pos.z - p.pos.z) / d) * SONIC_BOOMER.push * f * 0.7
    }
  }

  world.events.push({ t: 'boomer', at: { ...p.pos } })
  world.shake = Math.max(world.shake, 0.7)
}

/* --------------------------------------------------------------- timers */

export function stepWeaponTimers(world: World, dt: number): void {
  const p = world.player
  p.fireTimer = Math.max(0, p.fireTimer - dt)
  p.gunHeat = Math.max(0, p.gunHeat - dt)
  p.goadTimer = Math.max(0, p.goadTimer - dt)
  p.whoopTimer = Math.max(0, p.whoopTimer - dt)
  p.whoopActive = Math.max(0, p.whoopActive - dt)
  p.netTimer = Math.max(0, p.netTimer - dt)
  p.boomerTimer = Math.max(0, p.boomerTimer - dt)
  p.mountTimer = Math.max(0, p.mountTimer - dt)

  if (p.ammo < RIFLE.magazine) {
    p.rechargeTimer -= dt
    if (p.rechargeTimer <= 0) {
      p.ammo++
      const speed = 1 + world.upgrades.rechargeLevel * 0.22
      p.rechargeTimer = RIFLE.rechargeSeconds / speed
    }
  }

  for (const pred of world.predators) {
    if (pred.hitWindow > 0) {
      pred.hitWindow -= dt
      // Three hits, but only if they land inside five seconds of each other.
      if (pred.hitWindow <= 0) pred.hits = 0
    }
  }
}
