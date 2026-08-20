/**
 * Earl Reagan.
 *
 * "Reagan moves with Mario 64 weight": he takes about a third of a second to
 * reach full speed, keeps a little of his old direction through a turn, and
 * jumps roughly twice as high as a man honestly should. None of that is
 * physically defensible and all of it is the point — herding is a game of
 * repositioning, and repositioning has to feel good on its own before there is
 * anything to reposition around.
 */

import { BIKE, PLAYER } from '@/core/tuning'
import { approachAngle, clamp, dist2, headingOf, len2 } from '@/core/math'
import type { Obstacle } from '@/world/terrain'
import type { InputFrame, World } from './types'

const scratchObstacles: Obstacle[] = []

export function stepPlayer(world: World, input: InputFrame, dt: number): void {
  const p = world.player
  const t = world.terrain

  p.aimYaw = input.aimYaw
  p.aimPitch = input.aimPitch
  p.aiming = input.aim && !p.onBike

  if (p.onBike) {
    stepBike(world, input, dt)
    return
  }

  /* ---------------------------------------------------------- stamina */

  const wantsSprint = input.sprint && (input.moveX !== 0 || input.moveZ !== 0) && !p.aiming
  p.sprinting = wantsSprint && p.stamina > 1
  if (p.sprinting) {
    p.stamina = Math.max(0, p.stamina - PLAYER.stamina.drain * dt)
    p.staminaHold = PLAYER.stamina.regenDelay
  } else {
    p.staminaHold = Math.max(0, p.staminaHold - dt)
    if (p.staminaHold <= 0) {
      const bonus = 1 + world.upgrades.staminaLevel * 0.28
      p.stamina = Math.min(maxStamina(world), p.stamina + PLAYER.stamina.regen * bonus * dt)
    }
  }

  /* -------------------------------------------------- horizontal motion */

  const inLen = len2(input.moveX, input.moveZ)
  const wantX = inLen > 1e-4 ? input.moveX / inLen : 0
  const wantZ = inLen > 1e-4 ? input.moveZ / inLen : 0

  let speed = p.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed
  if (p.aiming) speed *= PLAYER.aimSpeedScale
  speed *= t.speedFactor(p.pos.x, p.pos.z)

  const targetVx = wantX * speed
  const targetVz = wantZ * speed
  // Accelerating and stopping use different rates. The gap is the skid.
  const rate = inLen > 1e-4 ? PLAYER.accel : PLAYER.decel
  const airControl = p.grounded ? 1 : 0.42
  p.vel.x += clamp((targetVx - p.vel.x) * rate * airControl * dt, -speed, speed)
  p.vel.z += clamp((targetVz - p.vel.z) * rate * airControl * dt, -speed, speed)

  /* ------------------------------------------------------------- jump */

  p.coyote = p.grounded ? PLAYER.coyoteTime : Math.max(0, p.coyote - dt)
  p.jumpBuffered = input.jump ? PLAYER.jumpBuffer : Math.max(0, p.jumpBuffered - dt)

  if (p.jumpBuffered > 0 && p.coyote > 0) {
    p.vel.y = PLAYER.jumpSpeed
    p.grounded = false
    p.coyote = 0
    p.jumpBuffered = 0
    p.jumpHeld = true
    world.events.push({ t: 'jump' })
  }
  // Releasing early clips the arc, so the jump has range rather than one height.
  if (p.jumpHeld && !input.jumpHeld && p.vel.y > 0) {
    p.vel.y *= PLAYER.jumpCutMultiplier
    p.jumpHeld = false
  }
  if (!input.jumpHeld) p.jumpHeld = false

  p.vel.y += PLAYER.gravity * dt

  /* ---------------------------------------------------- integrate & clip */

  p.pos.x += p.vel.x * dt
  p.pos.z += p.vel.z * dt
  p.pos.y += p.vel.y * dt

  resolveObstacles(world, dt)
  clampToBounds(world)

  // Chest-deep is as deep as he gets: past that he is wading, not walking.
  const ground = t.standHeight(p.pos.x, p.pos.z, PLAYER.wadeDepth)
  if (p.pos.y <= ground) {
    const hard = p.vel.y < -14
    if (!p.grounded) world.events.push({ t: 'land', hard })
    if (hard) world.shake = Math.max(world.shake, 0.35)
    p.pos.y = ground
    p.vel.y = 0
    p.grounded = true
  } else {
    p.grounded = false
  }

  /* ----------------------------------------------------------- facing */

  // While aiming he faces where he is looking; otherwise he faces where he is
  // going, and lags a little getting there.
  if (p.aiming) {
    p.heading = approachAngle(p.heading, p.aimYaw, 14 * dt)
  } else {
    const sp = len2(p.vel.x, p.vel.z)
    if (sp > 0.6) {
      p.heading = approachAngle(p.heading, headingOf(p.vel.x, p.vel.z), PLAYER.turnRate * dt)
    }
  }
}

export function maxStamina(world: World): number {
  return PLAYER.stamina.max * (1 + world.upgrades.staminaLevel * 0.25)
}

/* ------------------------------------------------------------ hover bike */

function stepBike(world: World, input: InputFrame, dt: number): void {
  const p = world.player
  const t = world.terrain
  const top = BIKE.topSpeed * (1 + world.upgrades.bikeLevel * 0.16)

  const inLen = len2(input.moveX, input.moveZ)
  if (inLen > 1e-4) {
    const want = headingOf(input.moveX, input.moveZ)
    p.heading = approachAngle(p.heading, want, BIKE.turnRate * dt)
    p.bikeSpeed = Math.min(top, p.bikeSpeed + BIKE.accel * dt)
  } else {
    p.bikeSpeed = Math.max(0, p.bikeSpeed - BIKE.brake * dt)
  }
  p.bikeSpeed *= t.speedFactor(p.pos.x, p.pos.z)

  p.vel.x = Math.sin(p.heading) * p.bikeSpeed
  p.vel.z = Math.cos(p.heading) * p.bikeSpeed
  p.pos.x += p.vel.x * dt
  p.pos.z += p.vel.z * dt

  resolveObstacles(world, dt)
  clampToBounds(world)

  // It hovers, so it ignores small ground detail and skims the bigger stuff —
  // and it hovers over water as happily as over dirt.
  const ground = Math.max(t.height(p.pos.x, p.pos.z), t.waterLevelAt(p.pos.x, p.pos.z) ?? -Infinity)
  p.pos.y += ((ground + BIKE.hoverHeight) - p.pos.y) * Math.min(1, dt * 7)
  p.grounded = true
  p.vel.y = 0
  p.sprinting = false
  // The bike is wherever Reagan is while he is on it.
  world.bikePos.x = p.pos.x
  world.bikePos.z = p.pos.z
  world.bikePos.y = ground
}

/** True when Reagan is close enough to the parked bike to get on it. */
export function canMountBike(world: World): boolean {
  const p = world.player
  return !p.onBike && dist2(p.pos, world.bikePos) < BIKE.mountRange
}

export function tryToggleBike(world: World): void {
  const p = world.player
  if (p.mountTimer > 0) return
  // The bike stays where it was left. Walking back to it is part of the cost of
  // having ridden off on it, and it stops F from conjuring one out of nowhere.
  if (!p.onBike && !canMountBike(world)) return
  p.mountTimer = 0.4
  if (p.onBike) {
    world.bikePos.x = p.pos.x
    world.bikePos.z = p.pos.z
    world.bikePos.y = world.terrain.height(p.pos.x, p.pos.z)
  }
  p.onBike = !p.onBike
  p.bikeSpeed = p.onBike ? len2(p.vel.x, p.vel.z) : 0
  if (!p.onBike) {
    p.vel.x *= 0.3
    p.vel.z *= 0.3
  }
  world.events.push({ t: 'mount', on: p.onBike })
  world.events.push({
    t: 'toast',
    text: p.onBike
      ? 'On the bike. The herd will not love you for it.'
      : 'Back on your feet. The bike stays where you left it.',
  })
}

/* ------------------------------------------------------------- collision */

function resolveObstacles(world: World, _dt: number): void {
  const p = world.player
  const t = world.terrain
  const obstacles = t.obstaclesNear(p.pos.x, p.pos.z, 8, scratchObstacles)
  for (const o of obstacles) {
    const dx = p.pos.x - o.x
    const dz = p.pos.z - o.z
    const d = len2(dx, dz)
    const r = o.radius + PLAYER.radius
    if (d >= r || d < 1e-4) continue

    // Low rocks are vaulted rather than bumped into: he steps straight up them.
    const topOfRock = t.height(o.x, o.z) + o.height
    const feet = p.pos.y
    if (!p.onBike && o.height <= PLAYER.vaultHeight && feet >= topOfRock - PLAYER.vaultHeight) {
      p.pos.y = Math.max(p.pos.y, topOfRock)
      continue
    }
    const push = (r - d) / d
    p.pos.x += dx * push
    p.pos.z += dz * push
  }
}

function clampToBounds(world: World): void {
  const b = world.terrain.def.bounds
  const p = world.player
  const m = 3
  p.pos.x = clamp(p.pos.x, b.minX + m, b.maxX - m)
  p.pos.z = clamp(p.pos.z, b.minZ + m, b.maxZ - m)
}
