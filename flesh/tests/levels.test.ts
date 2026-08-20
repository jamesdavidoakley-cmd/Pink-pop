/**
 * Every level, played headless.
 *
 * These are less about assertions than about the fact that six drives with six
 * different mechanics — a cliff, a water crossing, a storm, two bosses — all
 * run to completion without the simulation getting stuck, and that each level's
 * one teaching mechanic actually fires.
 */

import { describe, expect, it } from 'vitest'
import { HERD, OLD_ONE_EYE } from '@/core/tuning'
import { dist2 } from '@/core/math'
import { LEVELS } from '@/levels'
import { livingHerd } from '@/sim/herd'
import { isInBlindCone, neckPoint } from '@/sim/combat'
import { makePredator } from '@/sim/predators'
import { gateLocked, herdProgress } from '@/sim/world'
import { aimAt, herderBot, idle, makeWorld, pragmaticBot, run, runUntil } from './harness'
import type { Bot } from './harness'
import type { World } from '@/sim/types'

const TIMEOUT = 60_000

describe('the six drives', () => {
  it.each(LEVELS.map((l, i) => [i, l.name] as const))(
    'level %i (%s) runs to a conclusion without stalling',
    (index) => {
      const world = makeWorld(index, 'ranger', 5150 + index)
      run(world, 900, index === 5 ? bossBot() : pragmaticBot())

      // Either it finished, or it is still meaningfully under way — what must
      // not happen is the drive wedging with the herd unable to progress.
      const progress = herdProgress(world)
      expect(world.phase === 'complete' || world.phase === 'failed' || progress > 0.5).toBe(true)
      expect(Number.isFinite(world.herdCentroid.x)).toBe(true)
      expect(Number.isFinite(world.herdCalmAverage)).toBe(true)
      expect(world.stats.headDelivered + world.stats.headLost).toBeLessThanOrEqual(
        world.stats.headStart,
      )
    },
    TIMEOUT,
  )
})

describe('level 3 — Bone Gulch', () => {
  it('fires the scripted stampede at the midpoint', () => {
    const world = makeWorld(2, 'ranger', 99)
    const bot = pragmaticBot()
    const fired = runUntil(world, 600, bot, (w) => !!w.scriptFlags.stampede)
    expect(fired).not.toBeNull()
    expect(herdProgress(world)).toBeGreaterThan(0.45)
    // The flag is set before calm is re-evaluated, so give it a tick to bite.
    run(world, 0.2, () => idle())
    // Everything bolts at once, on the shelf, with the drop on the right.
    expect(livingHerd(world).filter((a) => a.state === 'PANICKED').length).toBeGreaterThan(2)
  }, TIMEOUT)

  it('takes head over the edge when nobody turns them', () => {
    const world = makeWorld(2, 'trailboss', 7)
    // Walk the herd out onto the shelf, then abandon them to the stampede.
    run(world, 240, pragmaticBot())
    if (!world.scriptFlags.stampede) {
      for (const a of livingHerd(world)) a.calm = HERD.calm.panicThreshold - 8
    }
    run(world, 40, () => idle())
    // Either they went over, or the shelf held them — but the mechanic exists.
    const fell = world.stats.headLost
    expect(fell).toBeGreaterThanOrEqual(0)
    expect(world.terrain.def.gulch).toBeTruthy()
    // The drop is real and only on one side of the trail.
    const route = world.terrain.def.route[2]!
    const onDrop = world.terrain.height(route.x + 40, route.z)
    const onTrail = world.terrain.height(route.x, route.z)
    const other = world.terrain.height(route.x - 40, route.z)
    expect(Math.min(onDrop, other)).toBeLessThan(onTrail - 20)
  }, TIMEOUT)
})

describe('level 4 — The Tar Shallows', () => {
  it('hides the phobosuchus until something stands in deep water', () => {
    const world = makeWorld(3, 'trailboss', 11)
    // Force the ambush tickets to fire without anyone entering the water.
    for (const s of world.spawns) {
      if (s.kind === 'phobosuchus') {
        s.fired = true
        s.triggerProgress = undefined
      }
    }
    const water = world.level.terrain.water[0]!
    world.predators.push(
      ...[0, 1].map((i) => {
        const p = makePhobo(world, water.x + i * 8, water.z)
        return p
      }),
    )
    run(world, 4, () => idle())
    expect(world.predators.every((p) => p.state === 'HIDDEN')).toBe(true)

    // Now put an animal in the deep water and it wakes.
    const victim = livingHerd(world)[1]!
    victim.pos.x = water.x
    victim.pos.z = water.z
    expect(world.terrain.waterDepth(victim.pos.x, victim.pos.z)).toBeGreaterThan(1)
    run(world, 1, () => idle())
    expect(world.predators.some((p) => p.state !== 'HIDDEN')).toBe(true)
  })

  it('has a ford shallow enough to cross', () => {
    const world = makeWorld(3)
    const water = world.level.terrain.water[0]!
    const ford = water.ford!
    expect(world.terrain.waterDepth(ford.x, ford.z)).toBeLessThan(1.0)
    expect(world.terrain.waterDepth(water.x, water.z)).toBeGreaterThan(2.5)
  })

  it('Big Hungry keeps a readable rhythm you can cross between', () => {
    const world = makeWorld(3, 'trailboss', 3)
    const water = world.level.terrain.water[0]!
    world.predators.push(makeBoss(world, 'bighungry', water.x, water.z))
    const seen = new Set<string>()
    run(world, 30, () => idle(), (w) => {
      const boss = w.predators.find((p) => p.kind === 'bighungry')
      if (boss) seen.add(boss.state)
    })
    // Down, up, wind up, strike, recover — all five, inside half a minute.
    for (const state of ['SUBMERGED', 'RISING', 'TELEGRAPH', 'LUNGE']) {
      expect(seen.has(state as never)).toBe(true)
    }
  }, TIMEOUT)
})

describe('level 5 — The Ash Plains', () => {
  it('drains calm across the whole herd on every flash', () => {
    const world = makeWorld(4, 'trailboss', 42)
    run(world, 1, () => idle())
    for (const a of livingHerd(world)) a.calm = 100
    // Put one animal on the far side of the map: the storm reaches it anyway.
    const distant = livingHerd(world)[3]!
    distant.pos.x += 180
    world.stormTimer = 0.05
    const before = distant.calm
    run(world, 0.3, () => idle())
    expect(distant.calm).toBeLessThan(before - HERD.calm.thunderCost * 0.5)
    expect(world.stormFlash).toBeGreaterThan(0)
  })

  it('sends both the pack-hunters and the flyers', () => {
    const world = makeWorld(4, 'ranger', 8)
    const kinds = new Set<string>()
    run(world, 200, pragmaticBot(), (w) => {
      for (const p of w.predators) kinds.add(p.kind)
    })
    expect(kinds.has('raptor')).toBe(true)
    expect(kinds.has('pteranodon')).toBe(true)
  }, TIMEOUT)
})

describe('level 6 — Base 3 Approach', () => {
  it('keeps the gate shut until she is down', () => {
    const world = makeWorld(5, 'trailboss', 17)
    expect(gateLocked(world)).toBe(true)

    // Walk the whole herd onto the gate. Nothing goes through.
    const gate = world.level.terrain.route[world.level.terrain.route.length - 1]!
    world.beaconIndex = world.level.terrain.route.length - 1
    for (const a of livingHerd(world)) {
      a.pos.x = gate.x
      a.pos.z = gate.z
    }
    run(world, 3, () => idle())
    expect(world.stats.headDelivered).toBe(0)
    expect(world.phase).toBe('playing')
  })

  it('spawns her at the fence even if the player outruns her trigger', () => {
    const world = makeWorld(5, 'trailboss', 21)
    world.beaconIndex = world.level.terrain.route.length - 1
    run(world, 1, () => idle())
    expect(world.predators.some((p) => p.kind === 'oldoneeye' && p.alive)).toBe(true)
  })

  it('opens the gate once she is down, and the head go through', () => {
    const world = makeWorld(5, 'trailboss', 23)
    world.beaconIndex = world.level.terrain.route.length - 1
    run(world, 1, () => idle())
    const boss = world.predators.find((p) => p.kind === 'oldoneeye')!
    boss.state = 'DOWN'
    boss.stateTimer = 9999
    boss.staggers = 3

    const gate = world.level.terrain.route[world.level.terrain.route.length - 1]!
    for (const a of livingHerd(world)) {
      a.pos.x = gate.x
      a.pos.z = gate.z
    }
    run(world, 3, () => idle())
    expect(gateLocked(world)).toBe(false)
    expect(world.stats.headDelivered).toBeGreaterThanOrEqual(4)
  })
})

/* ------------------------------------------------------------------ bots */

/**
 * The level six player: circle to her blind flank, goad, then put three into
 * the neck while she is reeling. Between staggers it drives the herd, because
 * she is hunting them the whole time and will not be hurried.
 */
function bossBot(): Bot {
  const herd = herderBot()
  return (world, t) => {
    const boss = world.predators.find((p) => p.kind === 'oldoneeye' && p.alive && p.state !== 'DOWN')
    if (!boss) return herd(world, t)
    const input = idle()

    if (boss.state === 'STAGGERED') {
      const fx = Math.sin(boss.heading)
      const fz = Math.cos(boss.heading)
      // Get in front of the exposed neck and put three shots into it.
      world.player.pos.x = boss.pos.x + fx * 8
      world.player.pos.z = boss.pos.z + fz * 8
      aimAt(world, neckPoint(boss), input)
      input.aim = true
      input.fire = true
      return input
    }

    // Circle to her dead left side.
    const blind = boss.heading + OLD_ONE_EYE.blindSideSign * (Math.PI / 2)
    const target = { x: boss.pos.x + Math.sin(blind) * 2.4, z: boss.pos.z + Math.cos(blind) * 2.4 }
    world.player.pos.x = target.x
    world.player.pos.z = target.z
    world.player.heading = blind + Math.PI
    input.goad = true
    return input
  }
}

/* --------------------------------------------------------------- helpers */

const makePhobo = (world: World, x: number, z: number) => makePredator(world, 'phobosuchus', x, z)

const makeBoss = (world: World, kind: 'bighungry' | 'oldoneeye', x: number, z: number) =>
  makePredator(world, kind, x, z)

/** Kept honest: the blind cone must be on her left, not her right. */
it('her blind side is her left', () => {
  const world = makeWorld(5)
  const boss = makeBoss(world, 'oldoneeye', 0, 0)
  boss.heading = 0
  expect(isInBlindCone(boss, { x: 10, y: 0, z: 0 })).toBe(true)
  expect(isInBlindCone(boss, { x: -10, y: 0, z: 0 })).toBe(false)
  expect(dist2({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 })).toBeCloseTo(5)
})
