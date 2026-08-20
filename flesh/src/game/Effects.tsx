import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PALETTE } from '@/art/palette'
import { flatMaterial } from '@/art/toon'

/**
 * Dust, tracers and impact rings.
 *
 * "Dust plumes from every footfall" is a lot of footfalls — twelve herd
 * animals, five predators and Reagan, all at once — so none of this is React.
 * The pools are plain arrays written to instanced meshes, and nothing here
 * allocates during play.
 */

interface Puff {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  size: number
  grow: number
  tint: number
}

interface Tracer {
  from: THREE.Vector3
  to: THREE.Vector3
  life: number
}

interface Ring {
  x: number
  y: number
  z: number
  life: number
  maxLife: number
  radius: number
  grow: number
  colour: string
}

const MAX_PUFFS = 420
const MAX_TRACERS = 24
const MAX_RINGS = 24

class FxSystem {
  puffs: Puff[] = []
  tracers: Tracer[] = []
  rings: Ring[] = []

  /** A footfall, a skid, or a body hitting the ground. */
  puff(x: number, y: number, z: number, size = 1, tint = 0): void {
    if (this.puffs.length >= MAX_PUFFS) return
    this.puffs.push({
      x: x + (Math.random() - 0.5) * 0.4 * size,
      y: y + 0.1,
      z: z + (Math.random() - 0.5) * 0.4 * size,
      vx: (Math.random() - 0.5) * 0.9 * size,
      vy: 0.5 + Math.random() * 0.8,
      vz: (Math.random() - 0.5) * 0.9 * size,
      life: 0,
      maxLife: 0.7 + Math.random() * 0.7,
      size: 0.35 * size,
      grow: 1.15 * size,
      tint,
    })
  }

  /**
   * A slow drifting mote of ash. Same pool as the dust, but it falls instead of
   * rising and lives a great deal longer.
   */
  mote(x: number, y: number, z: number): void {
    if (this.puffs.length >= MAX_PUFFS) return
    this.puffs.push({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 1.1,
      vy: -0.9 - Math.random() * 0.7,
      vz: (Math.random() - 0.5) * 1.1,
      life: 0,
      maxLife: 5 + Math.random() * 4,
      size: 0.1 + Math.random() * 0.12,
      grow: 0,
      tint: 1,
    })
  }

  burst(x: number, y: number, z: number, count: number, size = 1, tint = 0): void {
    for (let i = 0; i < count; i++) this.puff(x, y, z, size, tint)
  }

  tracer(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): void {
    if (this.tracers.length >= MAX_TRACERS) this.tracers.shift()
    this.tracers.push({
      from: new THREE.Vector3(from.x, from.y, from.z),
      to: new THREE.Vector3(to.x, to.y, to.z),
      life: 0,
    })
  }

  ring(x: number, y: number, z: number, colour: string, radius = 1, grow = 14, maxLife = 0.5): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift()
    this.rings.push({ x, y, z, life: 0, maxLife, radius, grow, colour })
  }

  update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!
      p.life += dt
      if (p.life >= p.maxLife) {
        // Swap-remove: order does not matter and splice in a hot loop does.
        this.puffs[i] = this.puffs[this.puffs.length - 1]!
        this.puffs.pop()
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.tint === 1) {
        // Ash: it drifts sideways on the wind rather than settling straight down.
        p.vx += Math.sin(p.life * 1.7 + p.z) * dt * 0.5
        p.vz += Math.cos(p.life * 1.3 + p.x) * dt * 0.5
      } else {
        p.vy -= dt * 0.6
        p.vx *= 1 - dt * 1.4
        p.vz *= 1 - dt * 1.4
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]!
      t.life += dt
      if (t.life > 0.11) this.tracers.splice(i, 1)
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!
      r.life += dt
      if (r.life >= r.maxLife) this.rings.splice(i, 1)
    }
  }

  clear(): void {
    this.puffs.length = 0
    this.tracers.length = 0
    this.rings.length = 0
  }
}

export const fx = new FxSystem()

/** A soft round puff, so dust looks like dust rather than like a quad. */
function makePuffTexture(): THREE.CanvasTexture {
  const size = 64
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

/* ---------------------------------------------------------------- render */

export function Effects() {
  const { camera } = useThree()
  const dust = useRef<THREE.InstancedMesh>(null)
  const tracers = useRef<THREE.InstancedMesh>(null)
  const rings = useRef<THREE.InstancedMesh>(null)

  const quad = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const beam = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.06, 0.06, 1, 5)
    // Lie along +Z so a lookAt-style orientation works without extra maths.
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.86, 1, 22), [])

  const dustMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        // A soft disc rather than a square. Without it every footfall is a
        // translucent rectangle hanging in the air, which is exactly what it
        // looked like before.
        map: makePuffTexture(),
        color: new THREE.Color(PALETTE.groundLight),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    [],
  )
  const beamMat = useMemo(() => flatMaterial(PALETTE.stunBeam, { opacity: 0.85 }), [])
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.corpYellow),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useLayoutEffect(() => {
    for (const m of [dust.current, tracers.current, rings.current]) {
      if (m) {
        m.frustumCulled = false
        m.count = 0
      }
    }
  }, [])

  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(),
      colour: new THREE.Color(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  useFrame((_, dt) => {
    fx.update(Math.min(dt, 0.05))
    const { m, q, p, s } = scratch

    /* -------- dust: billboarded quads that swell and fade as they rise ---- */
    const d = dust.current
    if (d) {
      const count = Math.min(fx.puffs.length, MAX_PUFFS)
      for (let i = 0; i < count; i++) {
        const puff = fx.puffs[i]!
        const t = puff.life / puff.maxLife
        p.set(puff.x, puff.y, puff.z)
        // Swell, then collapse. The collapse is what stands in for a per-puff
        // alpha, which would cost an instance colour attribute for very little.
        const fade = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28
        const size = (puff.size + puff.grow * t) * (puff.grow > 0 ? fade : 1)
        s.set(size, size, size)
        m.compose(p, camera.quaternion, s)
        d.setMatrixAt(i, m)
      }
      d.count = count
      d.instanceMatrix.needsUpdate = true
    }

    /* ---------------------------------------------- tracers: the stun beam */
    const tr = tracers.current
    if (tr) {
      const count = Math.min(fx.tracers.length, MAX_TRACERS)
      for (let i = 0; i < count; i++) {
        const t = fx.tracers[i]!
        p.copy(t.from).add(t.to).multiplyScalar(0.5)
        const length = t.from.distanceTo(t.to)
        const dir = s.copy(t.to).sub(t.from).normalize()
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
        m.compose(p, q, new THREE.Vector3(1, 1, length))
        tr.setMatrixAt(i, m)
      }
      tr.count = count
      tr.instanceMatrix.needsUpdate = true
    }

    /* --------------------------------- rings: whoops, goads, impacts, hits */
    const rg = rings.current
    if (rg) {
      const count = Math.min(fx.rings.length, MAX_RINGS)
      for (let i = 0; i < count; i++) {
        const r = fx.rings[i]!
        const t = r.life / r.maxLife
        p.set(r.x, r.y + 0.1, r.z)
        q.setFromAxisAngle(scratch.up, 0)
        q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        const radius = r.radius + r.grow * t
        s.set(radius, radius, radius)
        m.compose(p, q, s)
        rg.setMatrixAt(i, m)
      }
      rg.count = count
      rg.instanceMatrix.needsUpdate = true
      ringMat.opacity = 0.5
    }
  })

  return (
    <>
      <instancedMesh ref={dust} args={[quad, dustMat, MAX_PUFFS]} renderOrder={5} />
      <instancedMesh ref={tracers} args={[beam, beamMat, MAX_TRACERS]} renderOrder={6} />
      <instancedMesh ref={rings} args={[ringGeo, ringMat, MAX_RINGS]} renderOrder={4} />
    </>
  )
}
