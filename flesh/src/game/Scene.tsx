import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Beacons, Rocks, StartPen } from './Props'
import { Vegetation } from './Vegetation'
import { Ground, Lighting, Sky, Water } from './Environment'
import { Horizon } from './Horizon'
import { Structures } from './Structures'
import { CameraRig, type CameraState } from './CameraRig'
import { Effects, fx } from './Effects'
import { CeratopsianRig } from '@/art/rigs/Ceratopsian'
import { PredatorRig } from '@/art/rigs/Predators'
import { HoverBikeRig, ReaganRig, type HatKind } from '@/art/rigs/Reagan'
import { GEO, flatMaterial } from '@/art/toon'
import { PALETTE } from '@/art/palette'
import { Part } from '@/art/Part'
import { audio } from '@/audio/engine'
import { DRONE, GOAD, WHOOP } from '@/core/tuning'
import { dist2 } from '@/core/math'
import type { InputManager } from '@/core/input'
import { stepWorld } from '@/sim/world'
import { NO_INPUT, type SimEvent, type World } from '@/sim/types'

/**
 * The scene: everything inside the Canvas.
 *
 * The order of operations each frame is deliberate. `SimDriver` runs at a
 * negative render priority so the simulation has already advanced by the time
 * any rig reads it — otherwise every animal on screen is rendering last frame's
 * position, and at high speed the herd visibly lags the trail boss pushing it.
 */

export interface SceneProps {
  world: World
  input: InputManager
  camera: CameraState
  paused: boolean
  hat: HatKind
  droneActive: boolean
  onEvent: (event: SimEvent) => void
  skyFlash: React.RefObject<number>
}

export function Scene({ world, input, camera, paused, hat, droneActive, onEvent, skyFlash }: SceneProps) {
  const [predatorKey, setPredatorKey] = useState('')
  const goadSwing = useRef(0)
  const whoopSwing = useRef(0)

  // The predator roster changes a handful of times a level, so re-rendering the
  // list on a key change is cheap and keeps React out of the per-frame path.
  const roster = useCallback(() => world.predators.map((p) => p.id).join(','), [world])


  useEffect(() => {
    setPredatorKey(roster())
  }, [roster])

  return (
    <>
      <SimDriver
        world={world}
        input={input}
        camera={camera}
        paused={paused}
        onEvent={onEvent}
        skyFlash={skyFlash}
        goadSwing={goadSwing}
        whoopSwing={whoopSwing}
        onRosterChange={() => setPredatorKey(roster())}
      />
      <CameraRig world={world} input={input} state={camera} paused={paused} />

      <Sky level={world.level} flash={skyFlash} />
      <Lighting level={world.level} focus={world.player.pos} />
      <Horizon terrain={world.terrain} level={world.level} />
      <Ground terrain={world.terrain} level={world.level} />
      <Water terrain={world.terrain} />
      <Vegetation terrain={world.terrain} />
      <Rocks terrain={world.terrain} />
      <StartPen world={world} />
      <Structures world={world} />
      <Beacons world={world} />

      {world.herd.map((animal) => (
        <CeratopsianRig key={animal.id} animal={animal} />
      ))}

      <group key={predatorKey}>
        {world.predators.map((predator) => (
          <PredatorRig key={predator.id} predator={predator} />
        ))}
      </group>

      <ReaganRig player={world.player} hat={hat} goadSwing={goadSwing.current} whoopSwing={whoopSwing.current} />
      <HoverBikeRig player={world.player} parked={world.bikePos} />
      {droneActive && <SpotterDrone world={world} />}

      <Effects />
    </>
  )
}

/* ------------------------------------------------------------ the driver */

interface DriverProps {
  world: World
  input: InputManager
  camera: CameraState
  paused: boolean
  onEvent: (event: SimEvent) => void
  skyFlash: React.RefObject<number>
  goadSwing: React.RefObject<number>
  whoopSwing: React.RefObject<number>
  onRosterChange: () => void
}

function SimDriver({
  world,
  input,
  camera,
  paused,
  onEvent,
  skyFlash,
  goadSwing,
  whoopSwing,
  onRosterChange,
}: DriverProps) {
  /** Last gait phase per entity, for footfall detection. */
  const footfalls = useRef(new Map<number, number>())
  const rosterSize = useRef(-1)
  const reportedPhase = useRef<World['phase']>('playing')

  /*
   * A dev hook that advances the simulation without waiting for frames.
   *
   * `stepWorld` caps itself at four sub-steps a frame so a stalled tab cannot
   * deliver a sixty-second step to the herd — which means that on a machine
   * rendering at four frames a second the game runs at about a quarter speed
   * rather than skipping. That is the right behaviour, but it makes visual
   * checks of the later levels impossible: every screenshot is two seconds into
   * the drive, before anything has spawned. This lets the screenshot scripts
   * fast-forward. It is never called by the game itself.
   */
  useEffect(() => {
    // Create the handle rather than requiring it: the Canvas sets it in
    // onCreated, and whether that has run before this effect is not something
    // to depend on.
    const w = window as unknown as { __flesh?: Record<string, unknown> }
    const handle = (w.__flesh ??= {})
    handle.world = world
    handle.warp = (seconds: number, drive = true) => {
      reportedPhase.current = 'playing'
      const steps = Math.round(seconds * 60)
      for (let i = 0; i < steps; i++) {
        const input = { ...NO_INPUT, aimYaw: camera.yaw, aimPitch: camera.pitch }
        if (drive) {
          // Push the matriarch toward the next beacon, roughly as a player would.
          const lead = world.herd.find((a) => a.matriarch && !a.lost && !a.delivered)
          const beacon = world.level.terrain.route[Math.min(world.beaconIndex, world.level.terrain.route.length - 1)]
          if (lead && beacon) {
            let dx = beacon.x - lead.pos.x
            let dz = beacon.z - lead.pos.z
            const d = Math.hypot(dx, dz) || 1
            dx /= d
            dz /= d
            const px = lead.pos.x - dx * 3 - world.player.pos.x
            const pz = lead.pos.z - dz * 3 - world.player.pos.z
            const pd = Math.hypot(px, pz) || 1
            if (pd > 0.6) {
              input.moveX = px / pd
              input.moveZ = pz / pd
            }
          }
        }
        stepWorld(world, input, 1 / 60)
        // Deliver the events rather than dropping them. Skipping the audio and
        // the particles is deliberate — a hundred and fifty seconds of warp
        // would otherwise arrive as a wall of noise — but swallowing the
        // completion event means the drive silently never ends.
        for (const event of world.events) onEvent(event)
        world.events.length = 0
      }
    }
    /**
     * Put the drive at a given fraction along the route.
     *
     * The warp above simulates, which is what you want for spawns and state,
     * but its stand-in driver is crude and often loses the herd before it gets
     * anywhere. For checking that a piece of scenery looks right — the Bone
     * Gulch drop, the Tar Shallows crossing — you want to be standing at it,
     * with the herd, in one call.
     */
    handle.place = (t: number, lateral = 0) => {
      const p = world.terrain.routePoint(t, lateral)
      world.player.pos.x = p.x
      world.player.pos.z = p.z + 14
      world.player.pos.y = world.terrain.height(world.player.pos.x, world.player.pos.z)
      world.herd.forEach((a, i) => {
        if (a.lost || a.delivered) return
        const ang = (i / world.herd.length) * Math.PI * 2
        a.pos.x = p.x + Math.sin(ang) * (i === 0 ? 0 : 6 + (i % 3) * 4)
        a.pos.z = p.z + Math.cos(ang) * (i === 0 ? 0 : 6 + (i % 3) * 4)
        a.pos.y = world.terrain.height(a.pos.x, a.pos.z)
        a.calm = 100
      })
      // Advance the beacon so the compass and the markers agree with where we
      // have just been dropped.
      const route = world.level.terrain.route
      world.beaconIndex = Math.max(1, Math.min(route.length - 1, Math.round(t * (route.length - 1)) + 1))
    }

    return () => {
      delete handle.warp
      delete handle.world
      delete handle.place
    }
  }, [world, camera])

  useFrame((_, rawDt) => {
    // A tab that has been in the background for a minute must not deliver a
    // sixty-second step to the herd.
    const dt = Math.min(rawDt, 0.1)

    if (paused) {
      audio.setPanic(0)
      return
    }

    const frame = input.buildFrame(camera.yaw, camera.aimYaw, camera.aimPitch)
    input.endFrame()

    stepWorld(world, frame, dt)

    if (frame.goad) goadSwing.current = GOAD.cooldown
    if (frame.whoop) whoopSwing.current = WHOOP.duration
    goadSwing.current = Math.max(0, goadSwing.current - dt)
    whoopSwing.current = Math.max(0, whoopSwing.current - dt * 3)

    /* ------------------------------------------------------------ events */
    for (const event of world.events) handleEvent(event, world, onEvent, skyFlash)
    world.events.length = 0

    /* A safety net. The end of a drive is announced by an event, and if that
       event were ever missed — dropped by a warp, lost across a remount — the
       player would be left standing in a world that has already finished with
       no way out of it. The phase is the truth; the event is only the notice. */
    if (world.phase !== 'playing' && reportedPhase.current === 'playing') {
      reportedPhase.current = world.phase
      onEvent({ t: world.phase === 'complete' ? 'complete' : 'failed' })
    }

    if (world.predators.length !== rosterSize.current) {
      rosterSize.current = world.predators.length
      onRosterChange()
    }

    /* ------------------------------------------------- dust and footfalls */
    emitFootfalls(world, footfalls.current, dt)
    emitWeather(world, dt)

    /* ------------------------------------------------------------- audio */
    // The rumble that tells you the herd is going without you having to look.
    const panic = 1 - Math.min(1, world.herdCalmAverage / 100)
    audio.setPanic(world.mood === 'STAMPEDING' ? Math.max(0.75, panic) : panic * 0.8)
    audio.updateAmbient(dt, world.herdCalmAverage, world.herd.filter((a) => !a.lost && !a.delivered).length)
  }, -100)

  return null
}

function handleEvent(
  event: SimEvent,
  world: World,
  onEvent: (e: SimEvent) => void,
  skyFlash: React.RefObject<number>,
): void {
  switch (event.t) {
    case 'shot':
      audio.stunShot()
      fx.tracer(event.from, event.to)
      if (!event.hit) fx.burst(event.to.x, event.to.y, event.to.z, 3, 0.6)
      break
    case 'hit':
      audio.hit(event.headshot)
      fx.ring(event.at.x, event.at.y, event.at.z, PALETTE.stunBeam, 0.4, 4, 0.28)
      fx.burst(event.at.x, event.at.y, event.at.z, event.headshot ? 6 : 3, 0.5)
      break
    case 'predator_down':
      audio.predatorDown()
      fx.burst(event.at.x, event.at.y, event.at.z, 14, 2.2)
      world.shake = Math.max(world.shake, 0.5)
      break
    case 'predator_stagger':
      fx.burst(event.at.x, event.at.y + 1, event.at.z, 5, 1.1)
      break
    case 'roar':
      audio.roar(event.kind === 'oldoneeye' || event.kind === 'bighungry')
      fx.ring(event.at.x, event.at.y + 2, event.at.z, PALETTE.corpRed, 1, 22, 0.7)
      break
    case 'goad':
      audio.goad(event.connected)
      fx.burst(event.at.x, event.at.y, event.at.z, 7, 1.2)
      fx.ring(event.at.x, event.at.y, event.at.z, PALETTE.corpYellow, 0.6, 7, 0.3)
      break
    case 'whoop':
      audio.whoop()
      fx.ring(event.at.x, event.at.y, event.at.z, PALETTE.corpWhite, 1.5, WHOOP.radius, 0.9)
      break
    case 'boomer':
      audio.roar(true)
      fx.ring(event.at.x, event.at.y, event.at.z, PALETTE.stunBeam, 1, 24, 0.55)
      break
    case 'net':
      audio.ui(0.6)
      break
    case 'grab':
      audio.roar(false)
      fx.burst(event.at.x, event.at.y, event.at.z, 10, 1.6)
      break
    case 'head_lost':
      audio.headLost()
      fx.burst(event.at.x, event.at.y, event.at.z, 12, 1.8)
      break
    case 'head_delivered':
      audio.delivered(event.prime)
      break
    case 'beacon':
      audio.beacon()
      break
    case 'stampede':
      audio.klaxon()
      break
    case 'thunder':
      audio.thunder()
      skyFlash.current = 1
      break
    case 'jump':
      audio.jump()
      break
    case 'land':
      audio.land(event.hard)
      fx.burst(world.player.pos.x, world.player.pos.y, world.player.pos.z, event.hard ? 8 : 3, 0.9)
      break
    case 'boss_stagger':
      audio.roar(true)
      world.shake = Math.max(world.shake, 1)
      break
    case 'boss_down':
      audio.predatorDown()
      break
    case 'mount':
      audio.ui(event.on ? 1.3 : 0.8)
      break
    case 'toast':
    case 'complete':
    case 'failed':
    case 'freed':
    case 'calm_restored':
      break
  }
  onEvent(event)
}

/**
 * Dust from every footfall, and camera shake from the heavy ones.
 *
 * "a heavy two-step stomp on the rexes with camera shake tied to footfall
 * distance" — so the shake is scaled by how far away the animal is, which turns
 * an off-screen rex into something you feel arriving before you see it.
 */
function emitFootfalls(world: World, last: Map<number, number>, _dt: number): void {
  const player = world.player

  for (const a of world.herd) {
    if (a.lost || a.delivered || a.speedSmoothed < 0.8) continue
    const phase = a.gait * 3.1
    const prev = last.get(a.id) ?? phase
    last.set(a.id, phase)
    // Two footfalls per stride: one each time the sine crosses zero.
    if (Math.floor(prev / Math.PI) !== Math.floor(phase / Math.PI)) {
      fx.puff(a.pos.x, a.pos.y, a.pos.z, 0.7 * a.scale)
    }
  }

  for (const p of world.predators) {
    if (!p.alive || p.state === 'HIDDEN' || p.kind === 'pteranodon') continue
    const speed = Math.hypot(p.vel.x, p.vel.z)
    if (speed < 1) continue
    const phase = p.gait * (p.kind === 'raptor' ? 9 : 5.2)
    const prev = last.get(p.id + 100000) ?? phase
    last.set(p.id + 100000, phase)
    if (Math.floor(prev / Math.PI) !== Math.floor(phase / Math.PI)) {
      const heavy = p.kind === 'rex' || p.kind === 'oldoneeye' || p.kind === 'bighungry'
      fx.puff(p.pos.x, p.pos.y, p.pos.z, heavy ? 2.1 * p.scale : 0.6)
      if (heavy) {
        const d = dist2(p.pos, player.pos)
        // Felt from sixty metres, and jarring at ten.
        const strength = Math.max(0, 1 - d / 60)
        world.shake = Math.max(world.shake, strength * strength * 0.55 * p.scale)
      }
    }
  }

  if (player.grounded && !player.onBike) {
    const speed = Math.hypot(player.vel.x, player.vel.z)
    if (speed > 1.5 && Math.random() < speed * 0.035) {
      fx.puff(player.pos.x, player.pos.y, player.pos.z, 0.45)
    }
  }
  if (player.onBike && player.bikeSpeed > 2) {
    fx.puff(player.pos.x, player.pos.y - 1, player.pos.z, 0.6)
  }
}

/**
 * Ashfall.
 *
 * The Ash Plains is meant to be a different place, not the same badlands with
 * the fog turned up. Slow motes drifting past the camera do more for that than
 * any amount of colour grading, and they cost nothing — they are the dust pool
 * with the gravity turned around.
 */
function emitWeather(world: World, dt: number): void {
  if (!world.level.storm) return
  const player = world.player
  // A handful per second, seeded around and above the camera.
  const wanted = 26 * dt
  const count = Math.floor(wanted) + (Math.random() < wanted % 1 ? 1 : 0)
  for (let i = 0; i < count; i++) {
    fx.mote(
      player.pos.x + (Math.random() - 0.5) * 46,
      player.pos.y + 9 + Math.random() * 9,
      player.pos.z + (Math.random() - 0.5) * 46,
    )
  }
}

/* ---------------------------------------------------------- spotter drone */

function SpotterDrone({ world }: { world: World }) {
  const ref = useRef<THREE.Group>(null)
  const rotor = useRef<THREE.Mesh>(null)

  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    const t = state.clock.elapsedTime * 0.9
    g.position.set(
      world.player.pos.x + Math.sin(t) * DRONE.orbitRadius,
      world.player.pos.y + DRONE.orbitHeight,
      world.player.pos.z + Math.cos(t) * DRONE.orbitRadius,
    )
    g.rotation.y = -t
    if (rotor.current) rotor.current.rotation.y += dt * 30
  })

  return (
    <group ref={ref}>
      <Part geo={GEO.box()} color={PALETTE.corpWhite} scale={[0.6, 0.22, 0.6]} />
      <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, -0.16, 0]} scale={[0.4, 0.14, 0.4]} outline={false} />
      <mesh ref={rotor} position={[0, 0.2, 0]} material={flatMaterial(PALETTE.corpWhite, { opacity: 0.4 })}>
        <cylinderGeometry args={[0.9, 0.9, 0.02, 12]} />
      </mesh>
      <Part geo={GEO.disc()} color={PALETTE.corpRed} position={[0, -0.24, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.3} flat outline={false} />
    </group>
  )
}
