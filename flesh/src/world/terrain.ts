/**
 * The ground.
 *
 * Terrain is a pure function of (x, z) rather than a mesh the physics engine
 * owns. That buys three things the brief needs: the simulation can ask for a
 * height without a raycast, the acceptance tests can run with no renderer at
 * all, and the visible mesh is guaranteed to agree with what the animals walk
 * on, because both call the same function.
 */

import { clamp, fbm, hash2, lerp, smoothstep, type V3 } from '@/core/math'

export interface RouteNode {
  x: number
  z: number
  /** Beacon label shown on the compass. */
  label: string
}

export interface WaterBody {
  x: number
  z: number
  radius: number
  /** How far below the surrounding ground the basin sinks. */
  depth: number
  /** A shallow crossing: the ford the player is meant to find. */
  ford?: { x: number; z: number; width: number }
}

export interface GulchDef {
  /** Which side of the route the drop is on: +1 right, -1 left. */
  side: 1 | -1
  /** Perpendicular distance from the route centreline where the ground gives out. */
  offset: number
  depth: number
  /** Along-route range the gulch exists over, as a fraction of route length. */
  from: number
  to: number
}

export interface TerrainDef {
  seed: number
  /** Amplitude of the general roll of the badlands. */
  amplitude: number
  /** Larger = broader, lazier hills. */
  featureScale: number
  route: RouteNode[]
  /** Width of the graded band along the route the herd walks comfortably. */
  corridorWidth: number
  water: WaterBody[]
  gulch?: GulchDef
  /** Tar: sticky ground that halves speed. Radius-based blobs. */
  tar: { x: number; z: number; radius: number }[]
  /** Hard playable bounds. Beyond this animals are considered wandered off. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export interface Obstacle {
  x: number
  z: number
  radius: number
  /** Visual height, and whether Reagan can vault it. */
  height: number
  kind: 'rock' | 'boulder' | 'stump'
  /** Stable per-instance rotation, so rendering is deterministic too. */
  rot: number
}

const WATER_SURFACE_BIAS = 0.35

/** Squared distance from point p to segment ab, plus the parametric position. */
function segmentClosest(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number; cx: number; cz: number; side: number } {
  const abx = bx - ax
  const abz = bz - az
  const lenSq = abx * abx + abz * abz || 1e-6
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lenSq, 0, 1)
  const cx = ax + abx * t
  const cz = az + abz * t
  const dx = px - cx
  const dz = pz - cz
  // Sign of the 2D cross product tells us which side of the route we are on.
  const side = Math.sign(abx * dz - abz * dx) || 1
  return { d: Math.sqrt(dx * dx + dz * dz), t, cx, cz, side }
}

export class Terrain {
  readonly def: TerrainDef
  readonly obstacles: Obstacle[]
  /** Cumulative arc length of the route, for gulch placement and progress. */
  private readonly cumulative: number[] = []
  private readonly totalLength: number

  constructor(def: TerrainDef) {
    this.def = def
    let acc = 0
    this.cumulative.push(0)
    for (let i = 1; i < def.route.length; i++) {
      const a = def.route[i - 1]!
      const b = def.route[i]!
      acc += Math.hypot(b.x - a.x, b.z - a.z)
      this.cumulative.push(acc)
    }
    this.totalLength = acc || 1
    this.obstacles = this.scatterObstacles()
  }

  /** Nearest point on the route polyline, with distance, side and progress 0..1. */
  routeInfo(x: number, z: number): { dist: number; side: number; progress: number; cx: number; cz: number } {
    const route = this.def.route
    let best = { d: Infinity, t: 0, cx: x, cz: z, side: 1 }
    let bestIdx = 0
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!
      const b = route[i]!
      const r = segmentClosest(x, z, a.x, a.z, b.x, b.z)
      if (r.d < best.d) {
        best = r
        bestIdx = i
      }
    }
    const segStart = this.cumulative[bestIdx - 1] ?? 0
    const segEnd = this.cumulative[bestIdx] ?? this.totalLength
    const along = lerp(segStart, segEnd, best.t)
    return { dist: best.d, side: best.side, progress: along / this.totalLength, cx: best.cx, cz: best.cz }
  }

  /** Ground height, before water. This is the surface things stand on. */
  height(x: number, z: number): number {
    const d = this.def
    const s = 1 / d.featureScale
    let h = fbm(x * s, z * s, 4) * d.amplitude
    // A second, sharper layer gives the badlands their eroded steps.
    h += fbm(x * s * 3.1 + 11.3, z * s * 3.1 - 4.7, 2) * d.amplitude * 0.28

    const route = this.routeInfo(x, z)

    // Grade the corridor flat-ish so the drive reads as a trail, not a scramble.
    const corridorBlend = 1 - smoothstep(d.corridorWidth * 0.5, d.corridorWidth * 1.6, route.dist)
    if (corridorBlend > 0) {
      const trailH = fbm(route.cx * s, route.cz * s, 4) * d.amplitude
      h = lerp(h, trailH * 0.75, corridorBlend * 0.85)
    }

    // Water basins.
    for (const w of d.water) {
      const dist = Math.hypot(x - w.x, z - w.z)
      const inside = 1 - smoothstep(w.radius * 0.55, w.radius, dist)
      if (inside > 0) {
        let depth = w.depth * inside
        if (w.ford) {
          // The ford is a raised bar across the basin. Finding it is the counter
          // to the phobosuchus, so it must be shallow enough to read visually.
          const fd = Math.hypot(x - w.ford.x, z - w.ford.z)
          const fordLift = 1 - smoothstep(w.ford.width * 0.4, w.ford.width, fd)
          depth *= 1 - fordLift * 0.86
        }
        h -= depth
      }
    }

    // The gulch: ground simply gives out on one side of the trail.
    if (d.gulch) {
      const g = d.gulch
      if (route.progress >= g.from && route.progress <= g.to && route.side === g.side) {
        const over = route.dist - g.offset
        if (over > 0) {
          h -= g.depth * smoothstep(0, 9, over)
        }
      }
    }

    return h
  }

  /** Surface normal by central difference. Used for slope limits and shading. */
  normal(x: number, z: number, eps = 0.6): V3 {
    const hL = this.height(x - eps, z)
    const hR = this.height(x + eps, z)
    const hD = this.height(x, z - eps)
    const hU = this.height(x, z + eps)
    const nx = hL - hR
    const nz = hD - hU
    const ny = 2 * eps
    const len = Math.hypot(nx, ny, nz) || 1
    return { x: nx / len, y: ny / len, z: nz / len }
  }

  /** 0 (flat) .. 1 (sheer). */
  slope(x: number, z: number): number {
    const n = this.normal(x, z)
    return clamp(1 - n.y, 0, 1)
  }

  /** Water surface level for the basin containing this point, or null. */
  waterLevelAt(x: number, z: number): number | null {
    for (const w of this.def.water) {
      const dist = Math.hypot(x - w.x, z - w.z)
      if (dist < w.radius) {
        const rim = this.heightWithoutWater(w.x + w.radius, w.z)
        return rim - WATER_SURFACE_BIAS
      }
    }
    return null
  }

  private heightWithoutWater(x: number, z: number): number {
    const d = this.def
    const s = 1 / d.featureScale
    let h = fbm(x * s, z * s, 4) * d.amplitude
    h += fbm(x * s * 3.1 + 11.3, z * s * 3.1 - 4.7, 2) * d.amplitude * 0.28
    const route = this.routeInfo(x, z)
    const corridorBlend = 1 - smoothstep(d.corridorWidth * 0.5, d.corridorWidth * 1.6, route.dist)
    if (corridorBlend > 0) {
      const trailH = fbm(route.cx * s, route.cz * s, 4) * d.amplitude
      h = lerp(h, trailH * 0.75, corridorBlend * 0.85)
    }
    return h
  }

  /** How deep the water is here. 0 on dry land. */
  waterDepth(x: number, z: number): number {
    const level = this.waterLevelAt(x, z)
    if (level === null) return 0
    return Math.max(0, level - this.height(x, z))
  }

  /** Multiplier on movement speed. Tar and deep water both bog you down. */
  speedFactor(x: number, z: number): number {
    let f = 1
    for (const t of this.def.tar) {
      const dist = Math.hypot(x - t.x, z - t.z)
      if (dist < t.radius) f *= lerp(0.52, 1, smoothstep(t.radius * 0.4, t.radius, dist))
    }
    const depth = this.waterDepth(x, z)
    if (depth > 0.1) f *= lerp(1, 0.45, clamp(depth / 2.2, 0, 1))
    return f
  }

  /**
   * True where the ground drops away hard enough to lose an animal. Drives both
   * the calm penalty near the edge and the Bone Gulch fall.
   */
  isCliffEdge(x: number, z: number): boolean {
    const d = this.def
    if (!d.gulch) return false
    const route = this.routeInfo(x, z)
    if (route.progress < d.gulch.from || route.progress > d.gulch.to) return false
    if (route.side !== d.gulch.side) return false
    return route.dist > d.gulch.offset - 3.5
  }

  /** How far below the trail this point has fallen. Used for "lost over the edge". */
  fallDepth(x: number, z: number): number {
    const route = this.routeInfo(x, z)
    const trailH = this.height(route.cx, route.cz)
    return trailH - this.height(x, z)
  }

  inBounds(x: number, z: number): boolean {
    const b = this.def.bounds
    return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ
  }

  /** Obstacles within `radius`. Linear scan is fine at these counts. */
  obstaclesNear(x: number, z: number, radius: number, out: Obstacle[]): Obstacle[] {
    out.length = 0
    const r2 = radius * radius
    for (const o of this.obstacles) {
      const dx = o.x - x
      const dz = o.z - z
      if (dx * dx + dz * dz < r2) out.push(o)
    }
    return out
  }

  /**
   * Rocks and stumps, scattered deterministically from the terrain seed. The
   * renderer instances the same list, so what you see is what you bump into.
   */
  private scatterObstacles(): Obstacle[] {
    const d = this.def
    const out: Obstacle[] = []
    const b = d.bounds
    const cell = 26
    for (let gx = Math.floor(b.minX / cell); gx <= Math.ceil(b.maxX / cell); gx++) {
      for (let gz = Math.floor(b.minZ / cell); gz <= Math.ceil(b.maxZ / cell); gz++) {
        const h = hash2(gx ^ d.seed, gz + d.seed)
        if (h > 0.62) continue
        const x = (gx + hash2(gx + 91, gz)) * cell
        const z = (gz + hash2(gx, gz + 57)) * cell
        if (!this.inBounds(x, z)) continue
        const route = this.routeInfo(x, z)
        // Keep the trail itself walkable; obstacles crowd the shoulders.
        if (route.dist < d.corridorWidth * 0.55) continue
        if (this.waterDepth(x, z) > 0.2) continue
        const roll = hash2(gx * 7 + 3, gz * 13 + 5)
        const kind: Obstacle['kind'] = roll < 0.16 ? 'stump' : roll < 0.62 ? 'rock' : 'boulder'
        const radius = kind === 'stump' ? 0.7 : kind === 'rock' ? 1.15 : 2.35
        const height = kind === 'stump' ? 1.1 : kind === 'rock' ? 0.75 : 2.6
        out.push({ x, z, radius, height, kind, rot: hash2(gx + 3, gz + 11) * Math.PI * 2 })
      }
    }
    return out
  }
}
