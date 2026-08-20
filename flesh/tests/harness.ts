/**
 * A headless driver for the simulation, plus a few bots that play the game
 * badly or well on purpose.
 *
 * The acceptance tests in the brief are all statements about how the game
 * *plays* — "a player who stands still and shoots everything loses more head
 * than a player who never fires". You cannot check that by asserting on a
 * constant. You have to actually play it, twice, differently. That is what this
 * file is for.
 */

import { headingOf, len2, type V3 } from '@/core/math'
import { DIFFICULTIES, type DifficultyId } from '@/state/difficulty'
import { LEVELS } from '@/levels'
import { NO_INPUT, type InputFrame, type Predator, type World } from '@/sim/types'
import { createWorld, currentBeacon, stepWorld } from '@/sim/world'
import { findMatriarch, livingHerd } from '@/sim/herd'
import { makePredator } from '@/sim/predators'

export const STEP = 1 / 60

export function makeWorld(levelIndex: number, difficulty: DifficultyId = 'trailboss', seed = 12345): World {
  return createWorld({ level: LEVELS[levelIndex]!, difficulty: DIFFICULTIES[difficulty], seed })
}

export type Bot = (world: World, t: number) => InputFrame

/** Run `seconds` of simulated time, one fixed step at a time. */
export function run(world: World, seconds: number, bot: Bot, onStep?: (w: World) => void): void {
  const steps = Math.round(seconds / STEP)
  for (let i = 0; i < steps; i++) {
    const input = bot(world, world.time)
    stepWorld(world, input, STEP)
    world.events.length = 0
    onStep?.(world)
    if (world.phase !== 'playing') return
  }
}

/** Run until `predicate` holds, returning the elapsed time, or null on timeout. */
export function runUntil(
  world: World,
  maxSeconds: number,
  bot: Bot,
  predicate: (w: World) => boolean,
): number | null {
  const steps = Math.round(maxSeconds / STEP)
  for (let i = 0; i < steps; i++) {
    stepWorld(world, bot(world, world.time), STEP)
    world.events.length = 0
    if (predicate(world)) return world.time
  }
  return null
}

/* ------------------------------------------------------------------ input */

export const idle = (): InputFrame => ({ ...NO_INPUT })

export function moveToward(world: World, target: { x: number; z: number }, input: InputFrame): InputFrame {
  const dx = target.x - world.player.pos.x
  const dz = target.z - world.player.pos.z
  const d = len2(dx, dz)
  if (d < 0.6) return input
  input.moveX = dx / d
  input.moveZ = dz / d
  return input
}

export function aimAt(world: World, target: V3, input: InputFrame): InputFrame {
  const dx = target.x - world.player.pos.x
  const dy = target.y - (world.player.pos.y + 1.5)
  const dz = target.z - world.player.pos.z
  const flat = len2(dx, dz)
  input.aimYaw = headingOf(dx, dz)
  input.aimPitch = Math.atan2(dy, flat)
  return input
}

export function nearestPredator(world: World, within = Infinity): Predator | null {
  let best: Predator | null = null
  let bestD = within
  for (const p of world.predators) {
    if (!p.alive || p.state === 'DOWN' || p.state === 'HIDDEN') continue
    const d = len2(p.pos.x - world.player.pos.x, p.pos.z - world.player.pos.z)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/* ------------------------------------------------------------------- bots */

/**
 * The archetype the brief says must lose. Drives the herd, but the moment
 * anything shows up it plants its feet and empties the rifle into it. Never
 * whoops, never goads.
 */
export function shooterBot(): Bot {
  return (world) => {
    const input = idle()
    const threat = nearestPredator(world, 70)
    if (threat) {
      aimAt(world, { x: threat.pos.x, y: threat.pos.y + 2.4, z: threat.pos.z }, input)
      input.aim = true
      input.fire = true
      return input // stands still and shoots
    }
    driveHerd(world, input)
    return input
  }
}

/**
 * The archetype that must win. Never touches the rifle. Pushes the matriarch,
 * whoops the moment the herd frays, and goads anything that gets close.
 */
export function herderBot(): Bot {
  return (world) => {
    const input = idle()
    const threat = nearestPredator(world, 26)

    // Whoop when the herd is actually fraying — not on cooldown as a habit.
    const fraying =
      world.mood === 'SKITTISH' ||
      world.mood === 'STAMPEDING' ||
      livingHerd(world).some((a) => a.straggler)
    if (world.player.whoopTimer <= 0 && fraying) input.whoop = true

    // Only engage something that is actually menacing the herd. Chasing a
    // predator across the badlands is exactly the mistake this bot must not make.
    const nearHerd =
      threat && len2(threat.pos.x - world.herdCentroid.x, threat.pos.z - world.herdCentroid.z) < 40
    // A predator already backing off has been dealt with; leave it alone.
    if (threat && nearHerd && threat.spooked <= 0 && threat.state !== 'DOWN') {
      const d = len2(threat.pos.x - world.player.pos.x, threat.pos.z - world.player.pos.z)
      if (d < 20) {
        // Get between it and the herd, and shove.
        moveToward(world, threat.pos, input)
        input.aimYaw = headingOf(threat.pos.x - world.player.pos.x, threat.pos.z - world.player.pos.z)
        input.sprint = true
        if (d < 3.2) input.goad = true
        return input
      }
    }

    driveHerd(world, input)
    return input
  }
}

/**
 * A competent player. Herds, goads what it can reach, and reaches for the rifle
 * when the goad is on cooldown and something is still on the herd. This is the
 * bot the level tests use, because the pacifist herder is a bonus objective
 * rather than the way the levels are meant to be beaten.
 */
export function pragmaticBot(): Bot {
  const herd = herderBot()
  return (world, t) => {
    const threat = nearestPredator(world, 55)
    const onHerd =
      threat &&
      len2(threat.pos.x - world.herdCentroid.x, threat.pos.z - world.herdCentroid.z) < 32 &&
      threat.spooked <= 0 &&
      threat.state !== 'DOWN'

    if (onHerd && threat) {
      const d = len2(threat.pos.x - world.player.pos.x, threat.pos.z - world.player.pos.z)
      const input = idle()
      aimAt(world, { x: threat.pos.x, y: threat.pos.y + 2.2, z: threat.pos.z }, input)
      if (d < 3.2 && world.player.goadTimer <= 0) {
        moveToward(world, threat.pos, input)
        world.player.heading = input.aimYaw
        input.goad = true
        return input
      }
      // Far enough from the herd that the shot does not cost them calm.
      const clearOfHerd =
        len2(
          world.player.pos.x - world.herdCentroid.x,
          world.player.pos.z - world.herdCentroid.z,
        ) > 16
      if (world.player.ammo > 0 && clearOfHerd) {
        input.aim = true
        input.fire = true
        return input
      }
      moveToward(world, threat.pos, input)
      input.sprint = true
      return input
    }

    return herd(world, t)
  }
}

/**
 * The shared driving behaviour: stand behind the matriarch on the line from the
 * next beacon and push, going to fetch stragglers when there are any.
 */
export function driveHerd(world: World, input: InputFrame): InputFrame {
  const lead = findMatriarch(world)
  const beacon = currentBeacon(world)
  if (!lead || !beacon) return input

  // Fetch a straggler if one has dropped off, because at the next beacon it is
  // gone. Nearest first, or the bot thrashes between two of them.
  const stragglers = livingHerd(world).filter((a) => a.straggler)
  stragglers.sort(
    (x, y) =>
      len2(x.pos.x - world.player.pos.x, x.pos.z - world.player.pos.z) -
      len2(y.pos.x - world.player.pos.x, y.pos.z - world.player.pos.z),
  )
  const straggler = stragglers[0]
  if (straggler) {
    /* Stand just behind it on the line back to the herd — close enough to be
       inside the eight-metre repulsion radius, which is the whole mechanism.
       Offsetting by a fraction of the distance puts the player thirteen metres
       away from an animal sixty metres adrift, where the push does nothing at
       all and the bot stands there indefinitely. */
    let dx = straggler.pos.x - lead.pos.x
    let dz = straggler.pos.z - lead.pos.z
    const d = len2(dx, dz) || 1
    dx /= d
    dz /= d
    const behind = { x: straggler.pos.x + dx * 3.5, z: straggler.pos.z + dz * 3.5 }
    moveToward(world, behind, input)
    input.sprint = true
    input.aimYaw = headingOf(-dx, -dz)
    return input
  }

  let dx = beacon.x - lead.pos.x
  let dz = beacon.z - lead.pos.z
  const d = len2(dx, dz) || 1
  dx /= d
  dz /= d
  // The push point: right up behind her on the beacon line, where the shove bites.
  const push = { x: lead.pos.x - dx * 3, z: lead.pos.z - dz * 3 }
  moveToward(world, push, input)
  input.aimYaw = headingOf(dx, dz)
  return input
}

/* ------------------------------------------------------------ test set-up */

/** Drop a predator at a chosen distance from the herd, on the flank. */
export function placePredator(world: World, kind: Predator['kind'], distance: number): Predator {
  const c = world.herdCentroid
  const p = makePredator(world, kind, c.x + distance, c.z)
  world.predators.push(p)
  return p
}

export function panickedCount(world: World): number {
  return livingHerd(world).filter((a) => a.state === 'PANICKED').length
}
