import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PALETTE } from '@/art/palette'
import { GEO, flatMaterial, outlineMaterial, toonMaterial } from '@/art/toon'
import { Part } from '@/art/Part'
import { hash2, smoothstep } from '@/core/math'
import { WORLD } from '@/core/tuning'
import type { Obstacle, Terrain } from '@/world/terrain'
import type { World } from '@/sim/types'

/**
 * Everything standing in the world that is not an animal.
 *
 * All of it is instanced: one draw call for every fern on the level, one for
 * every rock. The alternative — a mesh per prop — is what actually costs the
 * frame budget in a scene like this, long before the dinosaurs do.
 */

/* ---------------------------------------------------------------- ferns */

/** A fern: half a dozen splayed blades, merged into one geometry to instance. */
function buildFernGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const blade = new THREE.ConeGeometry(0.16, 1.5, 4)
    blade.translate(0, 0.75, 0)
    blade.rotateX(0.55)
    blade.rotateY(a)
    blade.translate(Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12)
    blades.push(blade)
  }
  return mergeGeometries(blades)
}

/** Minimal merge: position + normal only, which is all a toon material needs. */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0
  let indexCount = 0
  for (const g of list) {
    vertexCount += g.attributes.position!.count
    indexCount += g.index ? g.index.count : g.attributes.position!.count
  }
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const indices = new Uint32Array(indexCount)
  let vo = 0
  let io = 0
  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute
    const n = g.attributes.normal as THREE.BufferAttribute
    positions.set(p.array as Float32Array, vo * 3)
    normals.set(n.array as Float32Array, vo * 3)
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices[io++] = g.index.getX(i) + vo
    } else {
      for (let i = 0; i < p.count; i++) indices[io++] = i + vo
    }
    vo += p.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  out.setIndex(new THREE.BufferAttribute(indices, 1))
  return out
}

const FERN_COUNT = 1000

export function Foliage({ terrain }: { terrain: Terrain }) {
  const geo = useMemo(buildFernGeometry, [])
  const mat = useMemo(() => toonMaterial(PALETTE.fern), [])
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const b = terrain.def.bounds
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    let placed = 0
    // Deterministic scatter from the same hash the obstacles use, so a level
    // looks identical every time it is loaded.
    for (let i = 0; placed < FERN_COUNT && i < FERN_COUNT * 4; i++) {
      const x = b.minX + hash2(i, terrain.def.seed) * (b.maxX - b.minX)
      const z = b.minZ + hash2(terrain.def.seed, i * 7 + 3) * (b.maxZ - b.minZ)
      if (terrain.waterDepth(x, z) > 0.1) continue
      if (terrain.slope(x, z) > 0.45) continue
      const y = terrain.height(x, z)
      // Ferns cluster off the trail; the graded corridor is trodden bare.
      const route = terrain.routeInfo(x, z)
      const density = smoothstep(terrain.def.corridorWidth * 0.3, terrain.def.corridorWidth, route.dist)
      if (hash2(i * 13, i * 31) > density * 0.85 + 0.1) continue
      const s = 0.65 + hash2(i * 3, i * 5) * 0.9
      pos.set(x, y, z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(i, i * 2) * Math.PI * 2)
      scale.set(s, s * (0.8 + hash2(i, 9) * 0.6), s)
      m.compose(pos, q, scale)
      mesh.setMatrixAt(placed++, m)
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
  }, [terrain])

  return <instancedMesh ref={ref} args={[geo, mat, FERN_COUNT]} />
}

/* ---------------------------------------------------------------- rocks */

const ROCK_KINDS: { kind: Obstacle['kind']; colour: string; geo: () => THREE.BufferGeometry }[] = [
  { kind: 'rock', colour: PALETTE.rock, geo: () => GEO.blob() },
  { kind: 'boulder', colour: PALETTE.rockDark, geo: () => GEO.blob() },
  { kind: 'stump', colour: PALETTE.coatDark, geo: () => GEO.cylinder() },
]

export function Rocks({ terrain }: { terrain: Terrain }) {
  return (
    <>
      {ROCK_KINDS.map((k) => (
        <RockSet key={k.kind} terrain={terrain} kind={k.kind} colour={k.colour} geo={k.geo()} />
      ))}
    </>
  )
}

function RockSet({
  terrain,
  kind,
  colour,
  geo,
}: {
  terrain: Terrain
  kind: Obstacle['kind']
  colour: string
  geo: THREE.BufferGeometry
}) {
  const items = useMemo(() => terrain.obstacles.filter((o) => o.kind === kind), [terrain, kind])
  const body = useRef<THREE.InstancedMesh>(null)
  const ink = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => toonMaterial(colour), [colour])
  const inkMat = useMemo(() => outlineMaterial(1.1), [])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    items.forEach((o, i) => {
      const y = terrain.height(o.x, o.z)
      pos.set(o.x, y + o.height * 0.32, o.z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rot)
      scale.set(o.radius * 2.1, o.height * 1.5, o.radius * 2.1)
      m.compose(pos, q, scale)
      body.current?.setMatrixAt(i, m)
      ink.current?.setMatrixAt(i, m)
    })
    if (body.current) {
      body.current.instanceMatrix.needsUpdate = true
      body.current.frustumCulled = false
    }
    if (ink.current) {
      ink.current.instanceMatrix.needsUpdate = true
      ink.current.frustumCulled = false
    }
  }, [items, terrain])

  if (items.length === 0) return null
  return (
    <>
      <instancedMesh ref={body} args={[geo, mat, items.length]} />
      <instancedMesh ref={ink} args={[geo, inkMat, items.length]} />
    </>
  )
}

/* -------------------------------------------------------------- beacons */

/**
 * Route markers. Trans-Time puts up a clean white post with a hazard-yellow
 * light every hundred and fifty metres of a drive, which is the only tidy thing
 * for sixty-five million years in any direction.
 */
export function Beacons({ world }: { world: World }) {
  const route = world.level.terrain.route
  return (
    <>
      {route.slice(1, -1).map((node, i) => (
        <Beacon key={i} world={world} index={i + 1} x={node.x} z={node.z} label={node.label} />
      ))}
      <Gate world={world} />
    </>
  )
}

function Beacon({
  world,
  index,
  x,
  z,
}: {
  world: World
  index: number
  x: number
  z: number
  label: string
}) {
  const lamp = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const y = useMemo(() => world.terrain.height(x, z), [world.terrain, x, z])

  useFrame((state) => {
    const active = world.beaconIndex === index
    const passed = world.beaconIndex > index
    if (lamp.current) {
      lamp.current.rotation.y = state.clock.elapsedTime * 2.4
      const m = lamp.current.material as THREE.MeshBasicMaterial
      m.color.set(passed ? PALETTE.shadowSoft : active ? PALETTE.corpYellow : PALETTE.corpWhite)
      m.opacity = active ? 0.6 + Math.sin(state.clock.elapsedTime * 4) * 0.35 : 0.35
    }
    if (ring.current) {
      ring.current.visible = active
      ring.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.04)
    }
  })

  return (
    <group position={[x, y, z]}>
      <Part geo={GEO.cylinder()} color={PALETTE.corpWhite} position={[0, 3, 0]} scale={[0.28, 6, 0.28]} />
      {/* the hazard stripes, because Trans-Time signage is always cheerful */}
      {[1.2, 2.4, 3.6, 4.8].map((h) => (
        <Part key={h} geo={GEO.cylinder()} color={PALETTE.corpYellow} position={[0, h, 0]} scale={[0.31, 0.34, 0.31]} outline={false} />
      ))}
      <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 6.4, 0]} scale={[1.9, 0.9, 0.18]} />
      <mesh ref={lamp} position={[0, 7.3, 0]} material={flatMaterial(PALETTE.corpYellow, { opacity: 0.7 })}>
        <coneGeometry args={[0.55, 1.1, 6]} />
      </mesh>
      <mesh ref={ring} position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} material={flatMaterial(PALETTE.corpYellow, { opacity: 0.25, side: THREE.DoubleSide })}>
        <ringGeometry args={[WORLD.beaconRadius - 1.2, WORLD.beaconRadius, 40]} />
      </mesh>
    </group>
  )
}

/* ----------------------------------------------------------------- gate */

/** The laser fence and the Trans-Time gate the head go through. */
function Gate({ world }: { world: World }) {
  const route = world.level.terrain.route
  const node = route[route.length - 1]!
  const y = useMemo(() => world.terrain.height(node.x, node.z), [world.terrain, node])
  const beams = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    // Level six's fence is hot until she is down. Red means nothing goes through.
    const locked = world.level.boss === 'oldoneeye' && !world.scriptFlags.bossDefeated
    if (beams.current) {
      beams.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh
        const m = mesh.material as THREE.MeshBasicMaterial
        m.color.set(locked ? PALETTE.corpRed : PALETTE.stunBeam)
        m.opacity = 0.4 + Math.sin(state.clock.elapsedTime * 6 + i) * 0.18
      })
    }
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial
      m.color.set(locked ? PALETTE.corpRed : PALETTE.corpYellow)
      ring.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.03)
    }
  })

  const width = WORLD.gateRadius * 1.4

  return (
    <group position={[node.x, y, node.z]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[width * s, 0, 0]}>
          <Part geo={GEO.box()} color={PALETTE.corpWhite} position={[0, 5, 0]} scale={[1.6, 10, 1.6]} />
          <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 8.2, 0]} scale={[1.75, 1.4, 1.75]} outline={false} />
          <Part geo={GEO.box()} color={PALETTE.corpYellow} position={[0, 1.2, 0]} scale={[1.75, 0.5, 1.75]} outline={false} />
        </group>
      ))}
      {/* the sign, which is doing the most work of anything in the frame */}
      <Part geo={GEO.box()} color={PALETTE.corpWhite} position={[0, 10.4, 0]} scale={[width * 2.1, 2.4, 0.4]} />
      <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 10.4, 0.26]} scale={[width * 1.9, 1.5, 0.1]} outline={false} />

      <group ref={beams}>
        {[2.5, 4.2, 5.9, 7.6].map((h) => (
          <mesh key={h} position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]} material={flatMaterial(PALETTE.stunBeam, { opacity: 0.5 })}>
            <cylinderGeometry args={[0.12, 0.12, width * 2, 6]} />
          </mesh>
        ))}
      </group>

      <mesh ref={ring} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]} material={flatMaterial(PALETTE.corpYellow, { opacity: 0.28, side: THREE.DoubleSide })}>
        <ringGeometry args={[WORLD.gateRadius - 1.4, WORLD.gateRadius, 48]} />
      </mesh>
    </group>
  )
}

/* --------------------------------------------------------------- the pen */

/** Carver City's holding pen, where every drive starts. */
export function StartPen({ world }: { world: World }) {
  const node = world.level.terrain.route[0]!
  const y = useMemo(() => world.terrain.height(node.x, node.z), [world.terrain, node])
  const posts = useMemo(() => {
    const out: [number, number][] = []
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      // Leave the downtrail side open — that is the way out.
      if (a > Math.PI * 0.75 && a < Math.PI * 1.25) continue
      out.push([Math.sin(a) * 24, Math.cos(a) * 24])
    }
    return out
  }, [])

  return (
    <group position={[node.x, y, node.z]}>
      {posts.map(([x, z], i) => (
        <Part
          key={i}
          geo={GEO.cylinder()}
          color={PALETTE.coatDark}
          position={[x, world.terrain.height(node.x + x, node.z + z) - y + 1.1, z]}
          scale={[0.22, 2.2, 0.22]}
          outline={false}
        />
      ))}
    </group>
  )
}
