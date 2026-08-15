/**
 * These tests are the game's design document. Each one pins down a claim the
 * game makes to a six year old through its controls. If one of them goes red,
 * the game is teaching something untrue.
 */

import { describe, expect, it } from 'vitest'
import {
  canGetGoing,
  computeBudget,
  easiestWorkingThrottle,
  loadOnDrive,
  step,
  stickiness,
  totalMass,
  willItGrip,
  emptyDriveState,
  type Conditions,
  type Crate,
  type Rig,
} from './model'
import { MID_AXLE_SHARE, SLIP_MU_FACTOR, WHEEL_WEIGHTS_KG, type Zone } from './constants'

const crate = (mass: number, zone: Zone | null, id = 'c1'): Crate => ({
  id,
  mass,
  kind: 'brick',
  zone,
  secured: true,
})

const rig = (over: Partial<Rig> = {}): Rig => ({
  crates: [],
  tyres: 'road',
  wheelWeights: false,
  liftAxleRaised: false,
  ballastKg: 0,
  mudOnCabKg: 0,
  ...over,
})

const cond = (over: Partial<Conditions> = {}): Conditions => ({
  surface: 'dry_tarmac',
  slope: 0,
  bendRadius: null,
  sandActive: false,
  onBoards: false,
  ...over,
})

const still = { v: 0, isSlipping: false }
const flat = { throttle: 1, brake: 0 }

describe('placement — the lesson of level 4', () => {
  it('the same crate presses harder on the driving wheels at the back', () => {
    const rear = loadOnDrive(rig({ crates: [crate(2000, 'over_rear_axle')] }), cond(), 0)
    const mid = loadOnDrive(rig({ crates: [crate(2000, 'middle')] }), cond(), 0)
    const cab = loadOnDrive(rig({ crates: [crate(2000, 'over_cab')] }), cond(), 0)

    expect(rear).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(cab)
    // Six times the press, from moving one box.
    expect(rear - 1150).toBeCloseTo((cab - 1150) * 6, 5)
  })

  it('weight over the cab is wasted — no throttle at all gets it up the mud', () => {
    const c = cond({ surface: 'mud', slope: 0.08 })

    expect(canGetGoing(rig(), c)).toBe(false)
    expect(canGetGoing(rig({ crates: [crate(2500, 'over_cab')] }), c)).toBe(false)
    // The very same crate, moved to the back, and the lorry walks up.
    expect(canGetGoing(rig({ crates: [crate(2500, 'over_rear_axle')] }), c)).toBe(true)
  })
})

describe('surfaces', () => {
  it('get progressively slipperier in the order the levels meet them', () => {
    const order = ['dry_tarmac', 'wet_tarmac', 'gravel', 'wet_leaves', 'mud', 'snow', 'ice'] as const
    const grips = order.map(
      (surface) => computeBudget(rig(), cond({ surface }), flat, still).gripAvailable,
    )
    for (let i = 1; i < grips.length; i++) {
      expect(grips[i]!).toBeLessThan(grips[i - 1]!)
    }
  })
})

describe('a sliding wheel is slipperier than a gripping one', () => {
  it('drops stickiness by the slip factor', () => {
    const gripping = stickiness(rig(), cond({ surface: 'mud' }), false)
    const sliding = stickiness(rig(), cond({ surface: 'mud' }), true)
    expect(sliding).toBeCloseTo(gripping * SLIP_MU_FACTOR, 10)
  })

  it('so pushing harder never recovers — only easing off does', () => {
    const r = rig({ crates: [crate(1500, 'over_rear_axle')] })
    const c = cond({ surface: 'ice' })
    let state = { ...emptyDriveState(), isSlipping: true }

    // Flat out for a second: still spinning.
    for (let i = 0; i < 60; i++) {
      state = step(state, r, c, { throttle: 1, brake: 0 }, 1 / 60).state
    }
    expect(state.isSlipping).toBe(true)

    // Ease right off: grip comes back.
    for (let i = 0; i < 60; i++) {
      state = step(state, r, c, { throttle: 0.08, brake: 0 }, 1 / 60).state
    }
    expect(state.isSlipping).toBe(false)
  })
})

describe('hills', () => {
  it('raise demand, so a load that walked along the flat spins on a slope', () => {
    const r = rig({ crates: [crate(1800, 'middle')] })
    expect(willItGrip(r, cond({ surface: 'gravel', slope: 0 }))).toBe(true)
    expect(willItGrip(r, cond({ surface: 'gravel', slope: 0.1 }))).toBe(false)
  })

  it('and moving the same load rearward rescues it, with no change of thumb', () => {
    const c = cond({ surface: 'gravel', slope: 0.1 })
    expect(willItGrip(rig({ crates: [crate(1800, 'middle')] }), c)).toBe(false)
    expect(willItGrip(rig({ crates: [crate(1800, 'over_rear_axle')] }), c)).toBe(true)
  })

  it('but feathering it is always a second way out', () => {
    const c = cond({ surface: 'gravel', slope: 0.1 })
    const r = rig({ crates: [crate(1800, 'middle')] })
    expect(willItGrip(r, c)).toBe(false)
    expect(canGetGoing(r, c)).toBe(true)
  })
})

describe('shop items change the sums honestly', () => {
  it('wheel weights buy grip but cost you on the hill and at the brakes', () => {
    const bare = rig()
    const weighted = rig({ wheelWeights: true })
    const c = cond({ surface: 'snow', slope: 0.05 })

    const a = computeBudget(bare, c, flat, still)
    const b = computeBudget(weighted, c, flat, still)

    expect(b.gripAvailable).toBeGreaterThan(a.gripAvailable)
    expect(b.totalMass).toBe(a.totalMass + WHEEL_WEIGHTS_KG)
    expect(b.demandSlope).toBeGreaterThan(a.demandSlope)
  })

  it('the lift axle dumps the middle axle onto the driving wheels', () => {
    const down = loadOnDrive(rig(), cond(), 0)
    const up = loadOnDrive(rig({ liftAxleRaised: true }), cond(), 0)
    expect(up - down).toBeCloseTo(MID_AXLE_SHARE, 10)
  })

  it('knobbly tyres are worse on dry tarmac and better in mud', () => {
    const dryRoad = stickiness(rig({ tyres: 'road' }), cond({ surface: 'dry_tarmac' }), false)
    const dryKnob = stickiness(rig({ tyres: 'knobbly' }), cond({ surface: 'dry_tarmac' }), false)
    const mudRoad = stickiness(rig({ tyres: 'road' }), cond({ surface: 'mud' }), false)
    const mudKnob = stickiness(rig({ tyres: 'knobbly' }), cond({ surface: 'mud' }), false)

    expect(dryKnob).toBeLessThan(dryRoad)
    expect(mudKnob).toBeGreaterThan(mudRoad)
  })

  it('chains are transformative on ice and cap the top speed', () => {
    const iceRoad = stickiness(rig({ tyres: 'road' }), cond({ surface: 'ice' }), false)
    const iceChain = stickiness(rig({ tyres: 'chains' }), cond({ surface: 'ice' }), false)
    expect(iceChain).toBeGreaterThan(iceRoad * 2)

    const fast = computeBudget(rig({ tyres: 'road' }), cond(), flat, { v: 10, isSlipping: false })
    const chained = computeBudget(rig({ tyres: 'chains' }), cond(), flat, { v: 10, isSlipping: false })
    expect(chained.requestedAccel).toBeLessThan(fast.requestedAccel)
  })

  it('sand is a real, temporary boost', () => {
    const plain = computeBudget(rig(), cond({ surface: 'ice' }), flat, still)
    const sanded = computeBudget(rig(), cond({ surface: 'ice', sandActive: true }), flat, still)
    expect(sanded.gripAvailable).toBeGreaterThan(plain.gripAvailable)
  })

  it('ballast trades grip against stopping distance', () => {
    const dry = rig()
    const full = rig({ ballastKg: 1200 })
    const c = cond({ surface: 'wet_leaves' })

    const a = computeBudget(dry, c, flat, still)
    const b = computeBudget(full, c, flat, still)
    expect(b.gripAvailable).toBeGreaterThan(a.gripAvailable)

    // Same brake hardware, more lorry: it takes longer to stop.
    const stopA = computeBudget(dry, c, { throttle: 0, brake: 1 }, { v: 10, isSlipping: false })
    const stopB = computeBudget(full, c, { throttle: 0, brake: 1 }, { v: 10, isSlipping: false })
    expect(Math.abs(stopB.accel)).toBeLessThan(Math.abs(stopA.accel))
  })

  it('recovery boards get a stuck lorry out', () => {
    const r = rig()
    const c = cond({ surface: 'mud', slope: 0.1 })
    expect(canGetGoing(r, c)).toBe(false)
    expect(canGetGoing(r, { ...c, onBoards: true })).toBe(true)
  })
})

describe('braking is the same purse, spent at the other end', () => {
  it('a heavier lorry stops less sharply with the same brakes', () => {
    const light = rig({ crates: [crate(500, 'middle')] })
    const heavy = rig({ crates: [crate(4000, 'middle')] })
    const c = cond()
    const moving = { v: 12, isSlipping: false }

    const a = computeBudget(light, c, { throttle: 0, brake: 1 }, moving)
    const b = computeBudget(heavy, c, { throttle: 0, brake: 1 }, moving)
    expect(Math.abs(b.accel)).toBeLessThan(Math.abs(a.accel))
  })

  it('loading right at the back helps you go and hurts you stop', () => {
    const rear = rig({ crates: [crate(3000, 'over_rear_axle')] })
    const front = rig({ crates: [crate(3000, 'over_cab')] })
    const c = cond({ surface: 'wet_tarmac' })
    const moving = { v: 12, isSlipping: false }

    expect(computeBudget(rear, c, flat, still).gripAvailable).toBeGreaterThan(
      computeBudget(front, c, flat, still).gripAvailable,
    )
    expect(computeBudget(rear, c, { throttle: 0, brake: 1 }, moving).gripBrake).toBeLessThan(
      computeBudget(front, c, { throttle: 0, brake: 1 }, moving).gripBrake,
    )
  })
})

describe('turning spends grip too', () => {
  it('a corner taken fast on gravel slides wide, and taken slowly does not', () => {
    const r = rig({ crates: [crate(2000, 'middle')] })
    const c = cond({ surface: 'gravel', bendRadius: 30 })

    const slow = computeBudget(r, c, { throttle: 0.2, brake: 0 }, { v: 4, isSlipping: false })
    const fast = computeBudget(r, c, { throttle: 0.2, brake: 0 }, { v: 14, isSlipping: false })

    expect(slow.demandLateral).toBeLessThan(slow.gripAvailable)
    expect(fast.demandLateral).toBeGreaterThan(fast.gripAvailable)
  })

  it('and the lorry actually drifts towards the outside', () => {
    const r = rig({ crates: [crate(2000, 'middle')] })
    const c = cond({ surface: 'gravel', bendRadius: 26 })
    let state = { ...emptyDriveState(), v: 14 }
    for (let i = 0; i < 45; i++) {
      state = step(state, r, c, { throttle: 0.3, brake: 0 }, 1 / 60).state
    }
    expect(state.lat).toBeGreaterThan(0.5)
  })
})

describe('mud on the cab', () => {
  it('drags the press off the driving wheels — Mudzilla is playing fair', () => {
    const clean = rig({ crates: [crate(2500, 'over_rear_axle')] })
    const mucky = rig({ crates: [crate(2500, 'over_rear_axle')], mudOnCabKg: 900 })
    const c = cond({ surface: 'mud', slope: 0.12 })

    const a = computeBudget(clean, c, flat, still)
    const b = computeBudget(mucky, c, flat, still)

    expect(b.totalMass).toBeGreaterThan(a.totalMass)
    // Grip barely moves, mass definitely does: the sum gets worse both ways.
    expect(b.demand - b.gripAvailable).toBeGreaterThan(a.demand - a.gripAvailable)
  })
})

describe('easing off is always an option', () => {
  it('there is a gentle throttle that works where a bootful does not', () => {
    const r = rig({ crates: [crate(2200, 'over_rear_axle')] })
    const c = cond({ surface: 'snow', slope: 0.05 })

    expect(willItGrip(r, c, 1)).toBe(false)
    const gentle = easiestWorkingThrottle(r, c)
    expect(gentle).not.toBeNull()
    expect(gentle!).toBeLessThan(1)
    expect(willItGrip(r, c, gentle!)).toBe(true)
  })
})

describe('the model is deterministic', () => {
  it('same inputs, same frame, every time', () => {
    const run = () => {
      let state = emptyDriveState()
      const r = rig({ crates: [crate(1200, 'middle')] })
      const c = cond({ surface: 'gravel', slope: 0.05, bendRadius: 40 })
      for (let i = 0; i < 600; i++) {
        state = step(state, r, c, { throttle: (i % 90) / 90, brake: 0 }, 1 / 60).state
      }
      return state
    }
    expect(run()).toEqual(run())
  })
})

describe('bookkeeping', () => {
  it('counts every kilo exactly once', () => {
    const r = rig({
      crates: [crate(800, 'over_cab', 'a'), crate(600, 'middle', 'b'), crate(0, null, 'c')],
      wheelWeights: true,
      ballastKg: 300,
      mudOnCabKg: 100,
    })
    expect(totalMass(r)).toBe(3000 + 1400 + WHEEL_WEIGHTS_KG + 300 + 100)
  })

  it('ignores cargo that has fallen off the back', () => {
    const r = rig({ crates: [{ ...crate(1000, 'over_rear_axle'), lost: true }] })
    expect(totalMass(r)).toBe(3000)
  })
})
