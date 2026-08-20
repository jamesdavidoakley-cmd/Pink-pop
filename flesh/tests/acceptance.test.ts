/**
 * The acceptance tests from §16 of the brief, as close to literally as they can
 * be written. "The build is not done until all of these pass."
 */

import { describe, expect, it } from 'vitest'
import { HERD } from '@/core/tuning'
import { dist2 } from '@/core/math'
import { findMatriarch, livingHerd } from '@/sim/herd'
import { isInBlindCone, neckPoint } from '@/sim/combat'
import {
  aimAt,
  driveHerd,
  herderBot,
  idle,
  makeWorld,
  placePredator,
  run,
  runUntil,
  shooterBot,
  STEP,
} from './harness'
import { stepWorld } from '@/sim/world'

describe('§16 — the herd reads the trail boss', () => {
  it('pushing the matriarch visibly moves the whole herd within two seconds', () => {
    const world = makeWorld(1)
    const lead = findMatriarch(world)!
    // Settle for a moment so nothing is left over from spawning.
    run(world, 1.0, () => idle())

    const before = livingHerd(world)
      .filter((a) => !a.matriarch)
      .map((a) => ({ id: a.id, z: a.pos.z }))
    const leadBeforeZ = lead.pos.z

    // Stand just behind her and walk into her, straight down the trail (-Z).
    world.player.pos.x = lead.pos.x
    world.player.pos.z = lead.pos.z + 4
    run(world, 2.0, (w) => {
      const input = idle()
      input.moveX = 0
      input.moveZ = -1
      input.aimYaw = Math.PI
      // Keep the shove honest: stay behind her rather than teleporting.
      const m = findMatriarch(w)
      if (m) {
        input.moveX = m.pos.x - w.player.pos.x
        input.moveZ = m.pos.z - w.player.pos.z
        const d = Math.hypot(input.moveX, input.moveZ) || 1
        input.moveX /= d
        input.moveZ /= d
      }
      return input
    })

    expect(lead.pos.z).toBeLessThan(leadBeforeZ - 3)

    const moved = before.filter((b) => {
      const now = livingHerd(world).find((a) => a.id === b.id)
      return now ? now.pos.z < b.z - 1.5 : false
    })
    // "the whole herd" — the great majority of it must have come with her.
    expect(moved.length).toBeGreaterThanOrEqual(Math.ceil(before.length * 0.7))
  })
})

describe('§16 — one ignored tyrannosaur costs you the formation', () => {
  it('causes a full stampede in under ten seconds', () => {
    const world = makeWorld(1)
    run(world, 1, () => idle())
    placePredator(world, 'rex', 30)

    const start = world.time
    const at = runUntil(world, 12, () => idle(), (w) => w.mood === 'STAMPEDING')

    expect(at).not.toBeNull()
    expect(at! - start).toBeLessThan(10)
  })

  it('a stampede can be recovered with the whoop and repositioning, without restarting', () => {
    const world = makeWorld(1)
    run(world, 1, () => idle())
    const rex = placePredator(world, 'rex', 26)
    runUntil(world, 12, () => idle(), (w) => w.mood === 'STAMPEDING')
    expect(world.mood).toBe('STAMPEDING')

    // The rex is dealt with (as it would be by a goad or a stun), and the trail
    // boss goes back to work: stand with them and keep calling.
    rex.alive = false
    world.predators = []

    const recovered = runUntil(
      world,
      45,
      (w) => {
        const input = idle()
        const lead = findMatriarch(w)
        if (lead) {
          // Reposition to the herd, do not sprint (sprinting is not reassuring).
          const dx = lead.pos.x - w.player.pos.x
          const dz = lead.pos.z - w.player.pos.z
          const d = Math.hypot(dx, dz) || 1
          if (d > 7) {
            input.moveX = dx / d
            input.moveZ = dz / d
          }
        }
        if (w.player.whoopTimer <= 0) input.whoop = true
        return input
      },
      (w) => w.mood !== 'STAMPEDING' && w.herdCalmAverage > 70,
    )

    expect(recovered).not.toBeNull()
    expect(world.phase).toBe('playing')
    // Nothing was restarted, and the head are still on the count.
    expect(livingHerd(world).length).toBeGreaterThanOrEqual(world.stats.headStart - 1)
  })
})

describe('§16 — the rifle is not the answer', () => {
  it('standing still and shooting everything loses more head than the goad and the whoop', () => {
    const seeds = [11, 22, 33]
    // Three seeds because one run of a stochastic drive proves nothing, and
    // this is the single claim the whole design rests on.
    let shooterLost = 0
    let herderLost = 0
    let shooterDelivered = 0
    let herderDelivered = 0

    for (const seed of seeds) {
      const a = makeWorld(1, 'trailboss', seed)
      run(a, 600, shooterBot())
      const b = makeWorld(1, 'trailboss', seed)
      run(b, 600, herderBot())

      shooterLost += a.stats.headLost
      herderLost += b.stats.headLost
      shooterDelivered += a.stats.headDelivered
      herderDelivered += b.stats.headDelivered
    }

    expect(herderLost).toBeLessThan(shooterLost)
    expect(herderDelivered).toBeGreaterThan(shooterDelivered)
  }, 120_000)

  it('firing near the herd costs calm, so distance is genuinely better play', () => {
    const near = makeWorld(1)
    const far = makeWorld(1)
    for (const w of [near, far]) run(w, 1, () => idle())

    const target = { x: near.herdCentroid.x, y: near.herdCentroid.y + 40, z: near.herdCentroid.z - 60 }

    // Shooter standing in the middle of the herd.
    near.player.pos.x = near.herdCentroid.x
    near.player.pos.z = near.herdCentroid.z
    // Shooter standing well off it.
    far.player.pos.x = far.herdCentroid.x + 40
    far.player.pos.z = far.herdCentroid.z

    for (const w of [near, far]) {
      run(w, 6, (world) => {
        const input = idle()
        aimAt(world, target, input)
        input.fire = true
        return input
      })
    }

    expect(near.stats.shotsFired).toBeGreaterThan(4)
    expect(near.herdCalmAverage).toBeLessThan(far.herdCalmAverage - 8)
  })

  it('a stun can never kill: a downed predator wakes up again', () => {
    const world = makeWorld(1)
    run(world, 1, () => idle())
    const rex = placePredator(world, 'rex', 34)
    rex.hits = 99
    rex.state = 'DOWN'
    rex.stateTimer = 10

    run(world, 12, () => idle())
    expect(rex.alive).toBe(true)
    expect(rex.state).not.toBe('DOWN')
  })
})

describe('§16 — Old One Eye', () => {
  it('cannot be beaten by shooting her from the front', () => {
    const world = makeWorld(5)
    run(world, 1, () => idle())
    const boss = placePredator(world, 'oldoneeye', 30)

    // Stand square in front of her and empty the rifle into her for a full minute.
    run(world, 60, (w) => {
      const input = idle()
      // Plant the player on her nose, so every shot is a clean frontal hit.
      const fx = Math.sin(boss.heading)
      const fz = Math.cos(boss.heading)
      w.player.pos.x = boss.pos.x + fx * 14
      w.player.pos.z = boss.pos.z + fz * 14
      aimAt(w, { x: boss.pos.x, y: boss.pos.y + 4.2, z: boss.pos.z }, input)
      input.aim = true
      input.fire = true
      return input
    })

    expect(world.stats.shotsFired).toBeGreaterThan(20)
    expect(boss.staggers).toBe(0)
    expect(boss.state).not.toBe('DOWN')
  })

  it('goes down to the blind-side goad and three shots to the neck, three times over', () => {
    const world = makeWorld(5)
    run(world, 1, () => idle())
    const boss = placePredator(world, 'oldoneeye', 26)

    let guard = 0
    while (boss.staggers < 3 && guard < 60 * 180) {
      guard++
      const input = idle()

      if (boss.state === 'STAGGERED') {
        // Neck is exposed. Three shots into it, from in front where it shows.
        const fx = Math.sin(boss.heading)
        const fz = Math.cos(boss.heading)
        world.player.pos.x = boss.pos.x + fx * 8
        world.player.pos.z = boss.pos.z + fz * 8
        aimAt(world, neckPoint(boss), input)
        input.aim = true
        input.fire = true
      } else {
        // Circle to her dead left side and shove.
        const blindAngle = boss.heading + Math.PI / 2
        world.player.pos.x = boss.pos.x + Math.sin(blindAngle) * 2.4
        world.player.pos.z = boss.pos.z + Math.cos(blindAngle) * 2.4
        world.player.heading = blindAngle + Math.PI
        input.goad = true
      }
      stepWorld(world, input, STEP)
      world.events.length = 0
    }

    expect(boss.staggers).toBe(3)
    expect(boss.state).toBe('DOWN')
  })

  it('has a blind cone on her left, and it is ninety degrees wide', () => {
    const world = makeWorld(5)
    const boss = placePredator(world, 'oldoneeye', 20)
    boss.heading = 0 // facing +Z
    const at = (angle: number, r = 10) => ({
      x: boss.pos.x + Math.sin(angle) * r,
      y: boss.pos.y,
      z: boss.pos.z + Math.cos(angle) * r,
    })

    // Facing +Z with up +Y, her left hand points along +X: a bearing of +PI/2.
    expect(isInBlindCone(boss, at(Math.PI / 2))).toBe(true) // dead on her left
    expect(isInBlindCone(boss, at(Math.PI / 2 - 0.7))).toBe(true) // inside the cone
    expect(isInBlindCone(boss, at(0))).toBe(false) // straight ahead
    expect(isInBlindCone(boss, at(-Math.PI / 2))).toBe(false) // her good side
    expect(isInBlindCone(boss, at(Math.PI))).toBe(false) // behind
  })
})

describe('§16 — performance budget', () => {
  it('steps twelve head and five predators well inside a 60fps frame', () => {
    const world = makeWorld(4)
    run(world, 2, () => idle())
    for (let i = 0; i < 5; i++) placePredator(world, i < 3 ? 'raptor' : 'rex', 30 + i * 6)
    expect(world.predators.length).toBeGreaterThanOrEqual(5)
    expect(livingHerd(world).length).toBe(12)

    const bot = herderBot()
    const iterations = 3600 // one simulated minute
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) {
      stepWorld(world, bot(world, world.time), STEP)
      world.events.length = 0
    }
    const perStep = (performance.now() - t0) / iterations

    // The simulation is one slice of a 16.6ms budget shared with rendering.
    // Anything under a millisecond leaves the frame comfortably to three.js.
    expect(perStep).toBeLessThan(1.0)
  })
})

describe('herd mechanics', () => {
  it('flags an animal that falls behind the matriarch as a straggler', () => {
    const world = makeWorld(1)
    const lead = findMatriarch(world)!
    const other = livingHerd(world).find((a) => !a.matriarch)!
    other.pos.x = lead.pos.x + 200
    run(world, 0.5, () => idle())
    expect(other.straggler).toBe(true)
  })

  it('loses a straggler that is still adrift when the beacon is made', () => {
    const world = makeWorld(1)
    const lead = findMatriarch(world)!
    const stray = livingHerd(world).find((a) => !a.matriarch)!
    stray.pos.x = lead.pos.x + 120
    run(world, 0.5, () => idle())
    expect(stray.straggler).toBe(true)

    // Walk the whole herd up to the beacon, leaving only the stray behind.
    // Capture the lead's origin first — she is in the list being moved.
    const beacon = world.level.terrain.route[1]!
    const lx = lead.pos.x
    const lz = lead.pos.z
    for (const a of livingHerd(world)) {
      if (a === stray) continue
      a.pos.x = beacon.x + (a.pos.x - lx)
      a.pos.z = beacon.z + (a.pos.z - lz)
    }
    run(world, 0.2, () => idle())

    expect(stray.lost).toBe(true)
    expect(world.stats.headLost).toBe(1)
    expect(world.stats.stragglersLost).toBe(1)
  })

  it('panic is contagious', () => {
    const world = makeWorld(1)
    run(world, 1, () => idle())
    const animals = livingHerd(world)
    const bolter = animals[1]!
    const neighbour = animals.find((a) => a !== bolter && dist2(a.pos, bolter.pos) < 9)
    expect(neighbour).toBeTruthy()

    bolter.calm = 0
    const before = neighbour!.calm
    run(world, 1.5, () => idle())
    expect(neighbour!.calm).toBeLessThan(before - HERD.calm.contagionDrain)
  })

  it('the whoop restores calm and pulls the herd in', () => {
    const world = makeWorld(1)
    run(world, 1, () => idle())
    for (const a of livingHerd(world)) a.calm = 40
    // herdCalmAverage is recomputed during the tick, so read it after one.
    run(world, STEP, () => idle())
    const before = world.herdCalmAverage
    expect(before).toBeLessThan(50)

    for (const a of livingHerd(world)) a.calm = 40
    run(world, STEP * 2, () => ({ ...idle(), whoop: true }))
    expect(world.herdCalmAverage).toBeGreaterThan(before + 10)
  })

  it('promotes a new matriarch if the old one is taken, rather than dissolving', () => {
    const world = makeWorld(1)
    const lead = findMatriarch(world)!
    lead.lost = true
    run(world, 0.2, () => idle())
    const now = findMatriarch(world)
    expect(now).toBeTruthy()
    expect(now!.id).not.toBe(lead.id)
  })
})

describe('drive completion', () => {
  it('a competent herder gets the herd to the gate and paid', () => {
    const world = makeWorld(0, 'trailboss', 7)
    run(world, 600, herderBot())
    expect(world.phase).toBe('complete')
    expect(world.stats.headDelivered).toBeGreaterThanOrEqual(4)
    expect(world.stats.creditsEarned).toBeGreaterThan(0)
  })

  it('never fires the rifle on a clean drive, and is paid the bonus for it', () => {
    const world = makeWorld(0, 'ranger', 3)
    run(world, 600, herderBot())
    expect(world.stats.shotsFired).toBe(0)
    if (world.phase === 'complete') {
      expect(world.stats.creditsEarned).toBeGreaterThanOrEqual(300)
    }
  })

  it('fails the drive below four head, without ever killing the player', () => {
    const world = makeWorld(0)
    run(world, 1, () => idle())
    const alive = livingHerd(world)
    for (let i = 0; i < alive.length - 2; i++) alive[i]!.lost = true
    world.stats.headLost = alive.length - 2

    const gate = world.level.terrain.route[world.level.terrain.route.length - 1]!
    world.beaconIndex = world.level.terrain.route.length - 1
    for (const a of livingHerd(world)) {
      a.pos.x = gate.x
      a.pos.z = gate.z
    }
    run(world, 2, () => idle())
    expect(world.phase).toBe('failed')
    expect(world.stats.headDelivered).toBeLessThan(4)
  })
})

describe('the drive is driven with the goad, not the rifle', () => {
  it('a goad shoves a rex clear of the herd', () => {
    const world = makeWorld(1)
    run(world, 1, () => idle())
    const rex = placePredator(world, 'rex', 12)
    // Walk up to it and shove.
    run(world, 6, (w) => {
      const input = idle()
      driveHerd(w, input)
      const dx = rex.pos.x - w.player.pos.x
      const dz = rex.pos.z - w.player.pos.z
      const d = Math.hypot(dx, dz) || 1
      input.moveX = dx / d
      input.moveZ = dz / d
      input.aimYaw = Math.atan2(dx, dz)
      w.player.heading = Math.atan2(dx, dz)
      if (d < 3.4) input.goad = true
      return input
    })
    expect(world.stats.shotsFired).toBe(0)
    // It got shoved, and it is not standing on the herd.
    expect(dist2(rex.pos, world.herdCentroid)).toBeGreaterThan(6)
  })
})
