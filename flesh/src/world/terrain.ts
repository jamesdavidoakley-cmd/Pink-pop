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
  /**
   * How wide the chasm is before the far wall climbs back up.
   *
   * Without a far wall the drop reads as a change of colour rather than as a
   * cliff: from the shelf you see an edge and then more ground a long way
   * below, which the eye files as distance, not depth. The opposite wall is
   * what makes it a canyon.
   */
  width: number
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

  /**
   * A point at `t` (0..1) along the route polyline, offset `side` metres
   * perpendicular to it.
   *
   * Scatter uses this instead of sampling the bounds uniformly. The playable
   * area is roughly half a square kilometre and the player never sees most of
   * it; spending instances on the far corners buys nothing, while the same
   * count spread along the trail is dense enough to read as ground cover.
   */
  routePoint(t: number, side: number): { x: number; z: number } {
    const route = this.def.route
    const target = clamp(t, 0, 1) * this.totalLength
    let i = 1
    while (i < route.length - 1 && (this.cumulative[i] ?? 0) < target) i++
    const a = route[i - 1]!
    const b = route[i]!
    const segStart = this.cumulative[i - 1] ?? 0
    const segLen = (this.cumulative[i] ?? this.totalLength) - segStart || 1
    const f = clamp((target - segStart) / segLen, 0, 1)
    const x = lerp(a.x, b.x, f)
    const z = lerp(a.z, b.z, f)
    let dx = b.x - a.x
    let dz = b.z - a.z
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    // Perpendicular in XZ.
    return { x: x + -dz * side, z: z + dx * side }
  }

  /** Ground height, before water. This is the surface things stand on. */
  height(x: number, z: number): number {
    const d = this.def
    const s = 1 / d.featureScale
    let h = fbm(x * s, z * s, 4) * d.amplitude
    // A second, sharper layer gives the badlands their eroded steps.
    h += fbm(x * s * 3.1 + 11.3, z * s * 3.1 - 4.7, 2) * d.amplitude * 0.28

    const route = this.routeInfo(x, z)

    /*
     * Badlands relief, applied only well off the trail.
     *
     * Plain fbm gives rolling dunes, which is the wrong landscape entirely —
     * the whole look of the strip is eroded benches and hard-edged mesas.
     * Ridged noise (1 - |n|) turns the smooth crests into sharp ones, and
     * quantising the result into terraces gives the flat benches and steep
     * risers that actually read as erosion.
     *
     * It is deliberately kept out of the corridor. The drive has to stay
     * walkable, and a herd trying to negotiate a staircase is not the game.
     */
    const away = smoothstep(d.corridorWidth * 0.95, d.corridorWidth * 2.8, route.dist)
    if (away > 0.001) {
      const ridge = 1 - Math.abs(fbm(x * s * 1.7 - 21.4, z * s * 1.7 + 8.9, 3))
      let relief = h + ridge * ridge * d.amplitude * 2.2

      // Terrace. The smoothstep is the riser; the flat part is the bench.
      const step = Math.max(1.5, d.amplitude * 0.55)
      const q = Math.floor(relief / step)
      const f = relief / step - q
      relief = (q + smoothstep(0.5, 0.92, f)) * step

      h = lerp(h, relief, away)
    }

    // Grade the corridor flat-ish so the drive reads as a trail, not a scramble.
    const corridorBlend = 1 - smoothstep(d.corridorWidth * 0.5, d.corridorWidth * 1.6, route.dist)
    if (corridorBlend > 0) {
      const trailH = fbm(route.cx * s, route.cz * s, 4) * d.amplitude
      h = lerp(h, trailH * 0.75, corridorBlend * 0.85)
    }

    /* Water basins.
     *
     * The falloff stays close to the rim on purpose. An earlier version
     * shallowed from 55% of the radius outward, which meant a seventy-eight
     * metre pool was only twenty-five metres of actual water with a wide flat
     * apron around it — and since the water surface is drawn at the full
     * radius, most of that surface sat a few centimetres above dry ground and
     * was invisible. The drawn disc and the carved basin have to agree. */
    for (const w of d.water) {
      const dist = Math.hypot(x - w.x, z - w.z)
      const inside = 1 - smoothstep(w.radius * 0.82, w.radius, dist)
      if (inside > 0) {
        let depth = w.depth * inside
        if (w.ford) {
          /* The ford is a raised bar across the basin, not a general shallowing.
             Finding it is the counter to the phobosuchus, so it has to be
             narrow enough to be a decision and obvious enough to be findable. */
          const fd = Math.hypot(x - w.ford.x, z - w.ford.z)
          const fordLift = 1 - smoothstep(w.ford.width * 0.45, w.ford.width * 0.8, fd)
          depth *= 1 - fordLift * 0.93
        }
        h -= depth
      }
    }

    // The gulch: the ground gives out on one side of the trail, and comes back
    // as a wall on the far side of the chasm.
    if (d.gulch) {
      const g = d.gulch
      if (route.progress >= g.from && route.progress <= g.to && route.side === g.side) {
        const over = route.dist - g.offset
        if (over > 0) {
          const fall = smoothstep(0, 5, over)
          const farWall = smoothstep(g.width, g.width + 16, over)
          h -= g.depth * (fall - farWall * 0.92)
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

  /**
   * Water surface level for the basin containing this point, or null.
   *
   * Anchored to the un-basined height at the *centre*, not to a single sample
   * on the rim. Sampling the rim was fragile: the underlying noise varies by
   * several metres across a basin this wide, so on some seeds the "surface"
   * came out below the basin floor and the water simply did not exist — which
   * is exactly what happened to the Tar Shallows crossing.
   */
  waterLevelAt(x: number, z: number): number | null {
    for (const w of this.def.water) {
      const dist = Math.hypot(x - w.x, z - w.z)
      if (dist < w.radius) {
        return this.heightWithoutWater(w.x, w.z) - WATER_SURFACE_BIAS
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

  /**
   * The height something of the given draft actually sits at.
   *
   * Anything in water deeper than its draft floats rather than walking along
   * the bottom. Without this a triceratops crossing a five-metre pool
   * disappears under the surface and reappears on the far bank, which looks
   * like a bug even though the simulation is doing exactly what it was told.
   */
  standHeight(x: number, z: number, draft: number): number {
    const ground = this.height(x, z)
    const level = this.waterLevelAt(x, z)
    if (level === null) return ground
    const depth = level - ground
    if (depth <= draft) return ground
    return level - draft
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
