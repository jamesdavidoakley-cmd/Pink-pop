import { useMemo } from 'react'
import * as THREE from 'three'
import { PALETTE } from '@/art/palette'
import { hash2 } from '@/core/math'
import type { LevelDef } from '@/levels/types'
import type { Terrain } from '@/world/terrain'

/**
 * The far badlands: a ring of mesas and buttes standing well outside the
 * playable bounds.
 *
 * Without them the world ends in a flat band of haze and the drive feels like
 * it is happening on a table. With them it feels like country.
 *
 * They deliberately opt out of the scene fog. At the density the levels use,
 * anything past about two hundred and fifty metres is already fully fog
 * coloured, so a fogged mesa at six hundred metres is invisible by definition.
 * Instead they are pre-mixed toward the fog colour by hand and drawn unlit —
 * flat silhouettes in haze, which is how the strip would have printed them
 * anyway, and it costs one draw call for the lot.
 */
export function Horizon({ terrain, level }: { terrain: Terrain; level: LevelDef }) {
  const { geometry, material } = useMemo(() => build(terrain, level), [terrain, level])
  return <mesh geometry={geometry} material={material} renderOrder={-900} frustumCulled={false} />
}

interface Tier {
  radius: number
  height: number
  y: number
}

function build(terrain: Terrain, level: LevelDef): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const b = terrain.def.bounds
  const cx = (b.minX + b.maxX) / 2
  const cz = (b.minZ + b.maxZ) / 2
  const base = terrain.height(cx, cz) - 6

  const parts: THREE.BufferGeometry[] = []
  const colours: number[] = []

  const rock = new THREE.Color(PALETTE.rockDark)
  const fog = new THREE.Color(level.mood.fog)
  const sky = new THREE.Color(level.mood.sky)
  const scratch = new THREE.Color()

  const COUNT = 24
  const seed = terrain.def.seed

  for (let i = 0; i < COUNT; i++) {
    const jitter = hash2(i * 7 + seed, i * 13)
    const angle = (i / COUNT) * Math.PI * 2 + (jitter - 0.5) * 0.22
    // Two rings, so the far one shows through the gaps in the near one.
    const ring = i % 3 === 0 ? 1 : 0
    const distance = (ring === 0 ? 520 : 880) + hash2(i, seed) * 190
    const x = cx + Math.sin(angle) * distance
    const z = cz + Math.cos(angle) * distance

    const scale = 0.75 + hash2(i * 3, seed + 5) * 0.7
    const ringScale = ring === 0 ? 1 : 1.7

    /* Three landform types, because a ring of identical cones reads as a row
       of tents. Real badlands are mostly broad flat-topped mesas with the odd
       butte and a rare spire, and the proportions matter more than the count:
       a mesa is far wider than it is tall. */
    const kind = hash2(i * 11, seed + 9)
    const shape =
      kind < 0.58 ? { radius: 128, height: 21, tiers: 2, taper: 0.9 } // mesa
        : kind < 0.9 ? { radius: 62, height: 40, tiers: 3, taper: 0.8 } // butte
          : { radius: 26, height: 62, tiers: 3, taper: 0.72 } // spire

    /* Stepped tiers. Real badlands erode into benches, and a stack of two or
       three tapered drums reads as one far more convincingly than a single
       cone does. */
    const tiers: Tier[] = []
    let y = 0
    let radius = shape.radius * scale * ringScale
    for (let t = 0; t < shape.tiers; t++) {
      const h = shape.height * scale * ringScale * (0.65 + hash2(i * 17 + t, seed) * 0.7)
      tiers.push({ radius, height: h, y: y + h / 2 })
      y += h
      radius *= shape.taper + hash2(i + t, seed + t) * 0.1
    }

    tiers.forEach((tier, t) => {
      // Low segment counts on purpose: these are printed shapes, not geology.
      const g = new THREE.CylinderGeometry(tier.radius * 0.9, tier.radius, tier.height, 7, 1)
      g.translate(x, base + tier.y, z)
      parts.push(g)

      /* Aerial perspective by hand. Further away and higher up means more haze;
         the top tiers catch a little sky. */
      // Enough haze to sit back, not so much that they stop being rock.
      const haze = Math.min(0.84, 0.42 + (distance - 480) / 1100 + t * 0.05)
      scratch.copy(rock).lerp(fog, haze).lerp(sky, t === tiers.length - 1 ? 0.1 : 0.03)
      const count = g.attributes.position!.count
      for (let v = 0; v < count; v++) colours.push(scratch.r, scratch.g, scratch.b)
    })
  }

  const geometry = mergeWithColour(parts, colours)
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
  return { geometry, material }
}

/** Position + colour only. These never take a light, so normals are wasted. */
function mergeWithColour(list: THREE.BufferGeometry[], colours: number[]): THREE.BufferGeometry {
  let vertexCount = 0
  let indexCount = 0
  for (const g of list) {
    vertexCount += g.attributes.position!.count
    indexCount += g.index ? g.index.count : g.attributes.position!.count
  }
  const positions = new Float32Array(vertexCount * 3)
  const indices = new Uint32Array(indexCount)
  let vo = 0
  let io = 0
  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute
    positions.set(p.array as Float32Array, vo * 3)
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
  out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), 3))
  out.setIndex(new THREE.BufferAttribute(indices, 1))
  return out
}
