/**
 * Invariants for the ground.
 *
 * Terrain is a pure function shared by the simulation and the renderer, so a
 * change to it moves the herd and the mesh at the same time. These are the
 * properties that have actually broken during development, each written after
 * the fact.
 */

import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/levels'
import { Terrain } from '@/world/terrain'

const terrains = LEVELS.map((l) => [l.name, new Terrain(l.terrain), l] as const)

describe('the trail stays walkable', () => {
  it.each(terrains)('%s grades a corridor the herd can follow', (_name, terrain) => {
    /* Sample the centreline end to end. The drive has to be a trail, not a
       scramble — the badlands relief is deliberately kept off it.
       Water is skipped: the Tar Shallows route runs straight into the pool on
       purpose, and the bank down into it is meant to be a bank. */
    let worst = 0
    for (let i = 0; i <= 200; i++) {
      const a = terrain.routePoint(i / 200, 0)
      const b = terrain.routePoint((i + 1) / 200, 0)
      if (terrain.waterDepth(a.x, a.z) > 0.3 || terrain.waterDepth(b.x, b.z) > 0.3) continue
      const rise = Math.abs(terrain.height(b.x, b.z) - terrain.height(a.x, a.z))
      const run = Math.hypot(b.x - a.x, b.z - a.z) || 1
      worst = Math.max(worst, rise / run)
    }
    expect(worst).toBeLessThan(0.5)
  })

  it.each(terrains)('%s keeps obstacles out of the graded corridor', (_name, terrain) => {
    for (const o of terrain.obstacles) {
      expect(terrain.routeInfo(o.x, o.z).dist).toBeGreaterThan(terrain.def.corridorWidth * 0.5)
    }
  })
})

describe('badlands relief', () => {
  it('is real off the trail and absent on it', () => {
    const terrain = new Terrain(LEVELS[1]!.terrain)
    const mid = terrain.routePoint(0.5, 0)

    // Roughness along the trail versus roughness well off it.
    const roughness = (lateral: number) => {
      let sum = 0
      for (let i = -10; i <= 10; i++) {
        const a = terrain.routePoint(0.5 + i * 0.002, lateral)
        const b = terrain.routePoint(0.5 + (i + 1) * 0.002, lateral)
        sum += Math.abs(terrain.height(b.x, b.z) - terrain.height(a.x, a.z))
      }
      return sum
    }
    expect(roughness(150)).toBeGreaterThan(roughness(0) * 1.5)
    expect(Number.isFinite(terrain.height(mid.x, mid.z))).toBe(true)
  })

  it('never produces a height that is not a number', () => {
    for (const [, terrain] of terrains) {
      const b = terrain.def.bounds
      for (let i = 0; i < 400; i++) {
        const x = b.minX + ((i * 37) % 1000) / 1000 * (b.maxX - b.minX)
        const z = b.minZ + ((i * 61) % 997) / 997 * (b.maxZ - b.minZ)
        expect(Number.isFinite(terrain.height(x, z))).toBe(true)
        expect(Number.isFinite(terrain.slope(x, z))).toBe(true)
      }
    }
  })
})

describe('the water crossing', () => {
  const terrain = new Terrain(LEVELS[3]!.terrain)
  const body = LEVELS[3]!.terrain.water[0]!

  it('is deep enough in the middle to be a decision', () => {
    expect(terrain.waterDepth(body.x, body.z)).toBeGreaterThan(3)
  })

  it('has a surface that actually sits above the basin floor', () => {
    /* The failure this catches: the surface was anchored to a single sample on
       the rim, which on this seed came out below the basin floor — so the water
       plane was drawn coincident with dry ground and the crossing had no water
       in it at all. */
    const level = terrain.waterLevelAt(body.x, body.z)
    expect(level).not.toBeNull()
    expect(level!).toBeGreaterThan(terrain.height(body.x, body.z) + 2)
  })

  it('stays deep most of the way out, not just at the very centre', () => {
    // Away from the ford, which is the raised bar.
    for (const d of [20, 40, 55]) {
      expect(terrain.waterDepth(body.x - d, body.z)).toBeGreaterThan(2.5)
    }
  })

  it('has a ford you can walk across, and it is a bar rather than a shallowing', () => {
    const ford = body.ford!
    expect(terrain.waterDepth(ford.x, ford.z)).toBeLessThan(0.6)
    // Deep water inboard of it, so crossing at the beacon line is still a swim.
    expect(terrain.waterDepth(body.x, body.z)).toBeGreaterThan(3)
    expect(terrain.waterDepth(body.x - 30, body.z)).toBeGreaterThan(3)
  })

  it('puts the ford off the beacon line, so it has to be spotted', () => {
    // "The counter is to send the herd across at a shallow ford you have to
    // spot first" — a ford sitting on the route would spot itself.
    const ford = body.ford!
    expect(terrain.routeInfo(ford.x, ford.z).dist).toBeGreaterThan(20)
  })

  it('floats anything with a draft shallower than the water', () => {
    const floor = terrain.height(body.x, body.z)
    const level = terrain.waterLevelAt(body.x, body.z)!
    // A wading man sits at his draft below the surface, not on the bottom.
    expect(terrain.standHeight(body.x, body.z, 1.25)).toBeCloseTo(level - 1.25, 3)
    expect(terrain.standHeight(body.x, body.z, 1.25)).toBeGreaterThan(floor)
    // On dry land nothing changes.
    const dry = terrain.routePoint(0.02, 0)
    expect(terrain.standHeight(dry.x, dry.z, 1.25)).toBeCloseTo(terrain.height(dry.x, dry.z), 5)
  })
})

describe('Bone Gulch', () => {
  const terrain = new Terrain(LEVELS[2]!.terrain)
  const gulch = LEVELS[2]!.terrain.gulch!

  it('drops away on one side of the trail and not the other', () => {
    const onTrail = terrain.height(...pt(terrain, 0.5, 0))
    const overSide = terrain.height(...pt(terrain, 0.5, gulch.side * (gulch.offset + 20)))
    const safeSide = terrain.height(...pt(terrain, 0.5, -gulch.side * (gulch.offset + 20)))
    expect(overSide).toBeLessThan(onTrail - 30)
    expect(Math.abs(safeSide - onTrail)).toBeLessThan(30)
  })

  it('has a far wall, so it reads as a canyon rather than as an edge', () => {
    const floor = terrain.height(...pt(terrain, 0.5, gulch.side * (gulch.offset + gulch.width * 0.5)))
    const farWall = terrain.height(...pt(terrain, 0.5, gulch.side * (gulch.offset + gulch.width + 40)))
    expect(farWall).toBeGreaterThan(floor + 30)
  })

  it('leaves a shelf wide enough for the herd to walk', () => {
    const onTrail = terrain.height(...pt(terrain, 0.5, 0))
    // Twelve head at six-metre separation span about twenty metres.
    for (const lateral of [-12, -6, 0, 6, 12]) {
      const h = terrain.height(...pt(terrain, 0.5, lateral))
      expect(Math.abs(h - onTrail)).toBeLessThan(6)
    }
  })

  it('only exists over the stretch it is meant to', () => {
    const before = terrain.height(...pt(terrain, 0.05, gulch.side * (gulch.offset + 20)))
    const onTrail = terrain.height(...pt(terrain, 0.05, 0))
    expect(Math.abs(before - onTrail)).toBeLessThan(30)
  })
})

/** routePoint as a tuple, for the height calls above. */
function pt(terrain: Terrain, t: number, lateral: number): [number, number] {
  const p = terrain.routePoint(t, lateral)
  return [p.x, p.z]
}
