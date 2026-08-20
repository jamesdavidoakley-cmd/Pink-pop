import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PALETTE } from '@/art/palette'
import { outlineMaterial, toonMaterial } from '@/art/toon'
import { hash2, smoothstep } from '@/core/math'
import type { Terrain } from '@/world/terrain'

/**
 * Everything growing.
 *
 * All of it is instanced: one draw call per species for the whole level,
 * whatever the count. The alternative — a mesh per plant — is what actually
 * costs the frame budget in a scene like this, long before the dinosaurs do.
 *
 * The mix matters as much as the models. A single kind of fern scattered evenly
 * reads as a texture rather than as a place; five kinds with different heights,
 * different silhouettes and different placement rules read as country. The
 * snags in particular earn their keep — they are the treeline Reagan keeps
 * telling you not to turn your back on, and without something tall the horizon
 * has nothing for a rex to come out of.
 */

/* ------------------------------------------------------------- geometry */

/** Position + normal only. A toon material needs nothing else. */
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
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

/** A low spray of fronds. The ground cover of the whole Cretaceous. */
function fernGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const lean = 0.5 + (i % 3) * 0.12
    const blade = new THREE.ConeGeometry(0.19, 1.7, 4)
    blade.translate(0, 0.85, 0)
    blade.rotateX(lean)
    blade.rotateY(a)
    blade.translate(Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14)
    parts.push(blade)
  }
  return merge(parts)
}

/** A squat barrel trunk under a crown of fronds. Waist high on Reagan. */
function cycadGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(0.38, 0.5, 1.1, 7)
  trunk.translate(0, 0.55, 0)
  parts.push(trunk)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const frond = new THREE.ConeGeometry(0.15, 2.1, 3)
    frond.translate(0, 1.05, 0)
    frond.rotateX(0.95)
    frond.rotateY(a)
    frond.translate(0, 1.05, 0)
    parts.push(frond)
  }
  return merge(parts)
}

/** A clump of bare vertical stalks, jointed. Grows where the ground is damp. */
function horsetailGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + i * 0.3
    const r = 0.1 + (i % 4) * 0.11
    const h = 1.5 + (i % 3) * 0.55
    const stalk = new THREE.CylinderGeometry(0.045, 0.08, h, 4)
    stalk.translate(Math.sin(a) * r, h / 2, Math.cos(a) * r)
    parts.push(stalk)
    // A single dark collar stands in for the joints. The full set of rings was
    // sixteen extra cylinders a plant and invisible past five metres.
    const ring = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 4)
    ring.translate(Math.sin(a) * r, h * 0.55, Math.cos(a) * r)
    parts.push(ring)
  }
  return merge(parts)
}

/** A dead conifer. Bare, angular, and the only tall thing on the plain. */
function snagGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(0.16, 0.46, 6.2, 6)
  trunk.translate(0, 3.1, 0)
  parts.push(trunk)
  const branches: [number, number, number][] = [
    [2.4, 0.6, 1.1],
    [3.5, 2.4, 0.9],
    [4.4, 4.1, 1.3],
    [5.1, 5.6, 0.7],
  ]
  for (const [y, a, len] of branches) {
    const b = new THREE.CylinderGeometry(0.06, 0.13, len, 4)
    b.rotateZ(Math.PI * 0.36)
    b.translate(Math.sin(a) * len * 0.4, y, Math.cos(a) * len * 0.4)
    b.rotateY(a)
    parts.push(b)
  }
  return merge(parts)
}

/** A low scratchy bush. Fills the ground between the bigger things. */
function scrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const lump = new THREE.SphereGeometry(0.36, 4, 3)
    lump.translate(Math.sin(a) * 0.28, 0.3 + (i % 2) * 0.16, Math.cos(a) * 0.28)
    parts.push(lump)
  }
  return merge(parts)
}

/** A flat chip of rock. Dense, tiny, and it is what stops the ground being paint. */
function pebbleGeometry(): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(0.34, 0)
  g.scale(1, 0.42, 1)
  g.translate(0, 0.08, 0)
  return g
}

/** A wide flat plate of exposed bedrock, barely proud of the dirt. */
function slabGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.95, 1.05, 0.14, 6)
  g.translate(0, 0.04, 0)
  return g
}

/** Dry tussock. Same idea as the pebbles, in the other colour. */
function tuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const blade = new THREE.ConeGeometry(0.07, 0.62, 3)
    blade.translate(0, 0.31, 0)
    blade.rotateX(0.42)
    blade.rotateY(a)
    parts.push(blade)
  }
  return merge(parts)
}

/* -------------------------------------------------------------- species */

interface Species {
  id: string
  geo: () => THREE.BufferGeometry
  colour: string
  count: number
  scale: [number, number]
  /** 0 keeps it off the graded trail entirely, 1 lets it grow anywhere. */
  onTrail: number
  maxSlope: number
  /** How far either side of the trail this species is scattered. */
  spread: number
  /**
   * A hard exclusion radius around the route centreline.
   *
   * The chase camera sits twelve metres behind Reagan and springs out of
   * terrain but not out of plants, so anything tall growing near the trail ends
   * up inside the lens — and a cycad frond at eighty centimetres fills a third
   * of the screen. Density shaping alone is not enough: it makes it rarer, and
   * rare is worse than never for something this ugly when it happens.
   */
  keepClear?: number
  /** Prefers the edge of standing water. */
  wantsWater?: boolean
  outline: boolean
  shadow: boolean
}

const SPECIES: Species[] = [
  { id: 'fern', geo: fernGeometry, colour: PALETTE.fern, count: 1000, scale: [0.55, 1.35], onTrail: 0.14, maxSlope: 0.45, spread: 120, outline: false, shadow: true },
  { id: 'cycad', geo: cycadGeometry, colour: PALETTE.fernDark, count: 200, scale: [0.7, 1.5], onTrail: 0.06, maxSlope: 0.34, spread: 130, keepClear: 26, outline: true, shadow: true },
  { id: 'horsetail', geo: horsetailGeometry, colour: '#8fb84a', count: 220, scale: [0.7, 1.4], onTrail: 0.1, maxSlope: 0.3, spread: 150, wantsWater: true, outline: false, shadow: true },
  // The treeline. Kept well back from the trail, which is what makes it a
  // treeline rather than an avenue.
  { id: 'snag', geo: snagGeometry, colour: '#6b563c', count: 150, scale: [0.65, 1.4], onTrail: 0, maxSlope: 0.5, spread: 190, keepClear: 42, outline: true, shadow: true },
  { id: 'scrub', geo: scrubGeometry, colour: '#6d7a3a', count: 520, scale: [0.6, 1.5], onTrail: 0.3, maxSlope: 0.55, spread: 140, outline: false, shadow: false },
  // Clutter, right where the boots are. No outlines and no shadows — at this
  // size both are wasted, and there are more of these than of everything else
  // put together.
  { id: 'pebble', geo: pebbleGeometry, colour: PALETTE.rock, count: 1900, scale: [0.4, 1.7], onTrail: 1, maxSlope: 0.8, spread: 46, outline: false, shadow: false },
  { id: 'tuft', geo: tuftGeometry, colour: '#a8894e', count: 1500, scale: [0.6, 1.8], onTrail: 0.85, maxSlope: 0.6, spread: 55, outline: false, shadow: false },
  // Cracked slabs, sparse and large. They break the flat apron of the graded
  // trail, which is otherwise the emptiest part of the frame.
  { id: 'slab', geo: slabGeometry, colour: PALETTE.rock, count: 340, scale: [0.32, 0.85], onTrail: 1, maxSlope: 0.35, spread: 55, outline: false, shadow: false },
]

export function Vegetation({ terrain }: { terrain: Terrain }) {
  return (
    <>
      {SPECIES.map((s) => (
        <Scatter key={s.id} terrain={terrain} species={s} />
      ))}
    </>
  )
}

function Scatter({ terrain, species }: { terrain: Terrain; species: Species }) {
  const geo = useMemo(() => species.geo(), [species])
  const mat = useMemo(() => toonMaterial(species.colour), [species.colour])
  const inkMat = useMemo(() => outlineMaterial(0.8), [])
  const body = useRef<THREE.InstancedMesh>(null)
  const ink = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = body.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const salt = species.id.charCodeAt(0) * 31 + species.id.length
    let placed = 0

    // Deterministic scatter from the terrain seed, so a level looks identical
    // every time it loads and a screenshot is worth comparing against.
    for (let i = 0; placed < species.count && i < species.count * 8; i++) {
      /* Sample along the trail rather than across the bounds. The playable
         area is about half a square kilometre and the camera spends the whole
         drive within a hundred metres of the route, so uniform placement puts
         most of the budget where nobody will ever stand. */
      const t = hash2(i + salt, terrain.def.seed)
      const lateral = (hash2(terrain.def.seed + salt, i * 7 + 3) * 2 - 1) * species.spread
      const p = terrain.routePoint(t, lateral)
      const x = p.x
      const z = p.z
      if (!terrain.inBounds(x, z)) continue

      const depth = terrain.waterDepth(x, z)
      if (species.wantsWater) {
        // The margin of the water, not the middle of it.
        if (depth > 0.9 || depth < 0.02) continue
      } else if (depth > 0.1) continue
      if (terrain.slope(x, z) > species.maxSlope) continue

      const route = terrain.routeInfo(x, z)
      if (species.keepClear && route.dist < species.keepClear) continue
      const offTrail = smoothstep(terrain.def.corridorWidth * 0.28, terrain.def.corridorWidth, route.dist)
      const density = species.onTrail + (1 - species.onTrail) * offTrail
      if (hash2(i * 13 + salt, i * 31) > density * 0.9 + 0.05) continue

      const s = species.scale[0] + hash2(i * 3 + salt, i * 5) * (species.scale[1] - species.scale[0])
      pos.set(x, terrain.height(x, z), z)
      q.setFromAxisAngle(up, hash2(i + salt, i * 2) * Math.PI * 2)
      scale.set(s, s * (0.82 + hash2(i + salt, 9) * 0.5), s)
      m.compose(pos, q, scale)
      mesh.setMatrixAt(placed, m)
      ink.current?.setMatrixAt(placed, m)
      placed++
    }

    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    if (ink.current) {
      ink.current.count = placed
      ink.current.instanceMatrix.needsUpdate = true
      ink.current.frustumCulled = false
    }
  }, [terrain, species])

  return (
    <>
      <instancedMesh
        ref={body}
        args={[geo, mat, species.count]}
        castShadow={species.shadow}
        receiveShadow
      />
      {species.outline && <instancedMesh ref={ink} args={[geo, inkMat, species.count]} />}
    </>
  )
}
