import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp, damp } from '@/core/math'
import type { InputManager } from '@/core/input'
import type { World } from '@/sim/types'

/**
 * The camera.
 *
 * Default is the Mario 64 chase camera, because herding is a spatial problem
 * and you need to see where your animals are relative to you. Holding the right
 * mouse button snaps to an over-the-shoulder aim with a narrower field of view.
 *
 * Two behaviours matter more than they look:
 *
 *  - The boom springs out of geometry. It samples the ground along its own
 *    length and pulls in rather than clipping through a ridge, which on Bone
 *    Gulch is the difference between a playable shelf and a guessing game.
 *  - It never fights the player. Mouse input sets yaw and pitch directly; the
 *    only smoothing is on the boom length and the look-at point.
 */

export interface CameraState {
  yaw: number
  pitch: number
  /** Set by the rig each frame, read by everything that needs a shot direction. */
  aimYaw: number
  aimPitch: number
}

const CHASE = {
  distance: 12,
  // Above the herd's shoulder line. The animals are three metres tall and they
  // crowd the trail boss, so a lower boom spends the whole drive inside them.
  height: 4.6,
  minPitch: -0.85,
  maxPitch: 1.15,
  fov: 62,
}

const AIM = {
  distance: 2.6,
  height: 1.85,
  /** Over the right shoulder, so the crosshair is not behind Reagan's hat. */
  shoulder: 1.05,
  fov: 46,
}

export function CameraRig({
  world,
  input,
  state,
  paused,
}: {
  world: World
  input: InputManager
  state: CameraState
  paused: boolean
}) {
  const { camera } = useThree()
  const boom = useRef(CHASE.distance)
  const lookAt = useRef(new THREE.Vector3())
  const shake = useRef(new THREE.Vector3())
  const initialised = useRef(false)

  useFrame((_, dt) => {
    const p = world.player
    const step = Math.min(dt, 0.05)

    if (!paused) {
      const look = input.takeLook()
      state.yaw += look.yaw
      state.pitch = clamp(state.pitch + look.pitch, CHASE.minPitch, CHASE.maxPitch)
    }

    const aiming = p.aiming
    const targetFov = aiming ? AIM.fov : CHASE.fov
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = damp(cam.fov, targetFov, 9, step)
    cam.updateProjectionMatrix()

    /* ------------------------------------------------- where it wants to be */

    const focusY = p.pos.y + (aiming ? AIM.height : CHASE.height)
    const wantDistance = aiming ? AIM.distance : CHASE.distance

    const sinY = Math.sin(state.yaw)
    const cosY = Math.cos(state.yaw)
    const cosP = Math.cos(state.pitch)
    const sinP = Math.sin(state.pitch)

    // The boom points backwards from the look direction.
    const dirX = sinY * cosP
    const dirY = sinP
    const dirZ = cosY * cosP

    /* Spring out of geometry. Walk the boom outward in a few steps and stop at
       the first sample where the ground is above the boom — cheaper than a
       raycast against a 130k-triangle mesh, and stable frame to frame. */
    let allowed = wantDistance
    const steps = 7
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * wantDistance
      const sx = p.pos.x - dirX * t
      const sy = focusY - dirY * t
      const sz = p.pos.z - dirZ * t
      const ground = world.terrain.height(sx, sz) + 1.1
      if (sy < ground) {
        allowed = Math.max(1.4, t - wantDistance / steps)
        break
      }
    }
    // Pull in fast, ease out slowly: a camera that snaps outward is nauseating.
    boom.current =
      allowed < boom.current ? allowed : damp(boom.current, allowed, 4.5, step)

    const shoulder = aiming ? AIM.shoulder : 0
    // Right vector, for the over-the-shoulder offset.
    const rx = -cosY
    const rz = sinY

    let px = p.pos.x - dirX * boom.current + rx * shoulder
    let py = focusY - dirY * boom.current
    let pz = p.pos.z - dirZ * boom.current + rz * shoulder

    // Never let it end up underground, whatever the boom did.
    const floor = world.terrain.height(px, pz) + 0.9
    if (py < floor) py = floor

    if (!initialised.current) {
      camera.position.set(px, py, pz)
      initialised.current = true
    } else {
      const rate = aiming ? 22 : 13
      camera.position.x = damp(camera.position.x, px, rate, step)
      camera.position.y = damp(camera.position.y, py, rate, step)
      camera.position.z = damp(camera.position.z, pz, rate, step)
    }

    /* -------------------------------------------------------- screen shake */

    // Driven by the simulation's shake impulse: footfalls, stampedes, bosses.
    const amount = world.shake
    if (amount > 0.001) {
      const t = performance.now() * 0.05
      shake.current.set(
        Math.sin(t * 1.7) * amount * 0.28,
        Math.sin(t * 2.3 + 1.1) * amount * 0.24,
        Math.sin(t * 1.3 + 2.2) * amount * 0.28,
      )
    } else {
      shake.current.multiplyScalar(0.85)
    }
    camera.position.add(shake.current)

    /* ------------------------------------------------------------ look at */

    const targetLook = aiming
      ? // Aiming looks straight down the barrel line, well out in front.
        new THREE.Vector3(
          p.pos.x + dirX * 40,
          focusY + dirY * 40,
          p.pos.z + dirZ * 40,
        )
      : new THREE.Vector3(p.pos.x, p.pos.y + 1.6, p.pos.z)
    lookAt.current.lerp(targetLook, aiming ? 1 : 1 - Math.exp(-16 * step))
    camera.lookAt(lookAt.current)

    /* The rifle fires along the camera's own axis, so what the crosshair is
       over is what gets hit. Hip fire uses the same line with a spread cone. */
    state.aimYaw = state.yaw
    state.aimPitch = state.pitch
  })

  return null
}
