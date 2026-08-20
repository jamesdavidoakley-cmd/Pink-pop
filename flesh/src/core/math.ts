/**
 * Small, allocation-light maths used by the simulation.
 *
 * The simulation must be deterministic: given the same seed and the same input
 * stream it must produce the same world, frame for frame. That is what lets the
 * acceptance tests in `tests/` run the game headless. So everything random in
 * here comes from an explicit seeded generator, never from `Math.random`.
 */

export interface V3 {
  x: number
  y: number
  z: number
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })
export const clone = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z })

export const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Frame-rate independent exponential approach. `rate` is roughly 1/seconds. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt))

/** Horizontal (XZ) distance. Height rarely matters for steering. */
export const dist2 = (a: V3, b: V3): number => {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

export const distSq2 = (a: V3, b: V3): number => {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

export const len2 = (x: number, z: number): number => Math.sqrt(x * x + z * z)

/** Shortest signed angular difference, in radians, wrapped to [-PI, PI]. */
export const angleDelta = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export const approachAngle = (current: number, target: number, maxStep: number): number => {
  const d = angleDelta(current, target)
  if (Math.abs(d) <= maxStep) return target
  return current + Math.sign(d) * maxStep
}

/** Heading in radians for a XZ direction, matching three.js' -Z forward. */
export const headingOf = (x: number, z: number): number => Math.atan2(x, z)

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  range(lo: number, hi: number): number
  int(loInclusive: number, hiExclusive: number): number
  pick<T>(items: readonly T[]): T
  /** Deterministic fork, so subsystems can draw without disturbing each other. */
  fork(salt: number): Rng
}

/** mulberry32 — small, fast, good enough, and identical across platforms. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng: Rng = {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo)),
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length) % items.length],
    fork: (salt: number) => makeRng((seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0),
  }
  return rng
}

/** Integer hash → [0,1). Used by the terrain, which must be stateless. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** Value noise with a smoothstep fade. Cheap and plenty for chunky badlands. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1
}

export function fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i++) {
    sum += noise2(fx, fy) * amp
    norm += amp
    amp *= gain
    fx *= lacunarity
    fy *= lacunarity
  }
  return sum / norm
}
