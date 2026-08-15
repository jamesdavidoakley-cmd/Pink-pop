/**
 * The level gate. Every level must be beatable with only the kit the game has
 * handed over by that point, and the levels that exist to teach placement must
 * actually punish the wrong placement — otherwise the lesson is a coincidence.
 */

import { describe, expect, it } from 'vitest'
import { LEVELS, levelById } from './levels'
import { allPlacements, driveLevel, type BotOptions } from './bot'
import { canGetGoing, type Rig } from '../physics/model'
import type { TyreId, Zone } from '../physics/constants'

/** What the game has given the player for free by the time a level opens. */
function kitFor(levelNumber: number): BotOptions {
  const granted = LEVELS.filter((l) => l.number <= levelNumber && l.grants).map((l) => l.grants)
  return {
    tyres: granted.includes('knobbly') ? 'knobbly' : 'road',
    liftAxle: granted.includes('liftaxle'),
    sand: granted.includes('sand'),
  }
}

/** Knobblies are a trade-off, so the bot should be allowed to take them off. */
function tyreChoices(levelNumber: number): TyreId[] {
  const kit = kitFor(levelNumber)
  return kit.tyres === 'knobbly' ? ['knobbly', 'road'] : ['road']
}

describe('every level can be beaten', () => {
  for (const level of LEVELS) {
    it(`level ${level.number} — ${level.title}`, () => {
      const kit = kitFor(level.number)
      const failures: string[] = []

      for (const run of level.runs) {
        const placements = allPlacements(run.crates.map((c) => c.id))
        let solved = false

        outer: for (const tyres of tyreChoices(level.number)) {
          for (const liftAxle of kit.liftAxle ? [true, false] : [false]) {
            for (const placement of placements) {
              const result = driveLevel(level, run, placement, { ...kit, tyres, liftAxle })
              if (result.finished) {
                solved = true
                break outer
              }
            }
          }
        }

        if (!solved) failures.push(run.brief)
      }

      expect(failures).toEqual([])
    })
  }
})

describe('the placement levels really do depend on placement', () => {
  const putEverything = (levelId: string, zone: Zone) => {
    const level = levelById(levelId)!
    const run = level.runs[0]!
    const placement: Record<string, Zone> = {}
    for (const c of run.crates) placement[c.id] = zone
    return driveLevel(level, run, placement, kitFor(level.number))
  }

  it('level 4 is impossible with the box over the cab and easy over the axle', () => {
    expect(putEverything('l4', 'over_cab').finished).toBe(false)
    expect(putEverything('l4', 'over_rear_axle').finished).toBe(true)
  })

  it('level 5 is impossible with the load forward', () => {
    expect(putEverything('l5', 'over_cab').finished).toBe(false)
    expect(putEverything('l5', 'over_rear_axle').finished).toBe(true)
  })

  it('level 11 needs the press of a well-loaded bed, even on knobblies', () => {
    expect(putEverything('l11', 'over_cab').finished).toBe(false)
    expect(putEverything('l11', 'over_rear_axle').finished).toBe(true)
  })

  it('and the lift axle visibly raises the grit line when it is tapped', () => {
    const level = levelById('l11')!
    const run = level.runs[0]!
    const placement: Record<string, Zone> = { a: 'over_rear_axle', b: 'over_rear_axle' }
    const down = driveLevel(level, run, placement, { tyres: 'knobbly', liftAxle: false })
    const up = driveLevel(level, run, placement, { tyres: 'knobbly', liftAxle: true })
    expect(up.finished).toBe(true)
    expect(up.seconds).toBeLessThan(down.seconds)
  })
})

describe('the kit levels really do depend on the kit', () => {
  const rigOf = (over: Partial<Rig> = {}): Rig => ({
    crates: [],
    tyres: 'road',
    wheelWeights: false,
    liftAxleRaised: false,
    ballastKg: 0,
    mudOnCabKg: 0,
    ...over,
  })

  it('level 9 ice, on the rise, is far kinder with sand down', () => {
    const cond = {
      surface: 'ice' as const,
      slope: 0.05,
      bendRadius: null,
      onBoards: false,
    }
    const rig = rigOf({
      crates: [
        { id: 'a', mass: 1000, kind: 'barrel' as const, zone: 'over_rear_axle' as const, secured: true },
        { id: 'b', mass: 800, kind: 'barrel' as const, zone: 'over_rear_axle' as const, secured: true },
      ],
    })
    expect(canGetGoing(rig, { ...cond, sandActive: false })).toBe(true)
    expect(canGetGoing(rig, { ...cond, sandActive: true })).toBe(true)

    // Empty, though, the rise on the ice is only possible with sand.
    const bare = rigOf()
    expect(canGetGoing(bare, { ...cond, sandActive: false })).toBe(false)
    expect(canGetGoing(bare, { ...cond, sandActive: true })).toBe(true)
  })

  it('level 8 mud is a slog on road tyres and straightforward on knobblies', () => {
    const level = levelById('l8')!
    const run = level.runs[0]!
    const placement: Record<string, Zone> = { a: 'over_rear_axle', b: 'over_rear_axle' }

    const onRoad = driveLevel(level, run, placement, { tyres: 'road' })
    const onKnobbly = driveLevel(level, run, placement, { tyres: 'knobbly' })

    expect(onKnobbly.finished).toBe(true)
    if (onRoad.finished) {
      // If it is possible at all it should at least be visibly harder work.
      expect(onRoad.seconds).toBeGreaterThan(onKnobbly.seconds * 1.25)
    }
  })
})

describe('level shape', () => {
  it('numbers run 1 to 14 with no gaps', () => {
    expect(LEVELS.map((l) => l.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
  })

  it('the brake only appears once it has been introduced', () => {
    for (const level of LEVELS) {
      if (level.number < 7) expect(level.brakeEnabled).toBe(false)
    }
  })

  it('bosses sit at 10 and 14', () => {
    expect(LEVELS.filter((l) => l.isBoss).map((l) => l.number)).toEqual([10, 14])
  })

  it('never shows a child an adult word', () => {
    const banned = /friction|coefficient|traction|normal force|newton|kilogram/i
    for (const level of LEVELS) {
      expect(level.title).not.toMatch(banned)
      expect(level.spoken).not.toMatch(banned)
      for (const run of level.runs) expect(run.brief).not.toMatch(banned)
    }
  })
})
