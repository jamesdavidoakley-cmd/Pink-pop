/**
 * Cel shading and outlines.
 *
 * Two rules from the brief, both about staying fast:
 *
 *  - "Three-band toon shading via a step function on the light dot product."
 *    That is exactly what a three-texel gradient map fed to MeshToonMaterial
 *    is, so we build one texel-for-texel rather than writing a bespoke shader.
 *
 *  - "Implement outlines with inverted-hull backface rendering on every
 *    character, not post-processing, so it stays fast." So: a second copy of
 *    the geometry, front faces culled, pushed out along its normals. The push
 *    is done in view space and scaled by depth, which keeps the line a constant
 *    thickness on screen instead of vanishing at range.
 */

import * as THREE from 'three'

/* ------------------------------------------------------------- gradient */

let gradientCache: THREE.DataTexture | null = null

/** The step function: three flat bands, dark teal-ward through to full light. */
export function toonGradient(): THREE.DataTexture {
  if (gradientCache) return gradientCache
  // Three texels, nearest-filtered. Shading snaps between them.
  const data = new Uint8Array([88, 108, 255])
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  gradientCache = tex
  return tex
}

/* ------------------------------------------------------------ materials */

const toonCache = new Map<string, THREE.MeshToonMaterial>()

/** A cel-shaded material for one colour. Shared across every mesh using it. */
export function toonMaterial(color: string, opts?: { emissive?: string; transparent?: boolean; opacity?: number }): THREE.MeshToonMaterial {
  const key = `${color}|${opts?.emissive ?? ''}|${opts?.opacity ?? 1}`
  const hit = toonCache.get(key)
  if (hit) return hit
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonGradient(),
    emissive: opts?.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    transparent: opts?.transparent ?? (opts?.opacity ?? 1) < 1,
    opacity: opts?.opacity ?? 1,
  })
  toonCache.set(key, mat)
  return mat
}

/** Flat unlit colour, for signage and beams that should not take shading. */
const flatCache = new Map<string, THREE.MeshBasicMaterial>()
export function flatMaterial(
  color: string,
  opts?: { transparent?: boolean; opacity?: number; side?: THREE.Side },
): THREE.MeshBasicMaterial {
  const key = `${color}|${opts?.opacity ?? 1}|${opts?.side ?? 0}`
  const hit = flatCache.get(key)
  if (hit) return hit
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: opts?.transparent ?? (opts?.opacity ?? 1) < 1,
    opacity: opts?.opacity ?? 1,
    side: opts?.side ?? THREE.FrontSide,
    depthWrite: (opts?.opacity ?? 1) >= 1,
  })
  flatCache.set(key, mat)
  return mat
}

/* -------------------------------------------------------------- outlines */

const OUTLINE_VERT = /* glsl */ `
  uniform float thickness;
  void main() {
    // The same material has to work on ordinary meshes and on the instanced
    // rocks, so the instance transform is applied by hand here — three's
    // built-in instancing chunks are not included in a bare ShaderMaterial.
    #ifdef USE_INSTANCING
      vec4 local = instanceMatrix * vec4(position, 1.0);
      vec3 localNormal = mat3(instanceMatrix) * normal;
    #else
      vec4 local = vec4(position, 1.0);
      vec3 localNormal = normal;
    #endif
    vec4 mv = modelViewMatrix * local;
    vec3 n = normalize(normalMatrix * localNormal);
    /* Scale the push by view depth so the line keeps a constant screen width
       rather than thinning out to nothing as the animal walks away — but stop
       scaling past sixty metres. Beyond that a rock is a dozen pixels across
       and a constant-width line eats the whole shape, which turned the far
       treeline into a solid black wall. Distant things lose their ink, which
       is also how the printing worked. */
    float depth = clamp(-mv.z, 1.0, 60.0);
    mv.xyz += n * thickness * depth * 0.0085;
    gl_Position = projectionMatrix * mv;
  }
`

const OUTLINE_FRAG = /* glsl */ `
  uniform vec3 lineColor;
  void main() { gl_FragColor = vec4(lineColor, 1.0); }
`

const outlineCache = new Map<number, THREE.ShaderMaterial>()

/** Thick black ink. `thickness` is in nominal screen units. */
export function outlineMaterial(thickness = 1): THREE.ShaderMaterial {
  const key = Math.round(thickness * 100)
  const hit = outlineCache.get(key)
  if (hit) return hit
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: thickness },
      lineColor: { value: new THREE.Color(0x0b0705) },
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    // Front faces culled: only the back of the swollen hull survives, and it
    // survives only where it pokes out past the real silhouette.
    side: THREE.BackSide,
  })
  outlineCache.set(key, mat)
  return mat
}

/* ------------------------------------------------------------ geometries */

/**
 * Every dinosaur in the game is boxes, spheres, cones and cylinders. There are
 * only a handful of distinct primitives, so they are built once and shared —
 * a hundred and fifty meshes on screen reference maybe eight geometries.
 */
const geoCache = new Map<string, THREE.BufferGeometry>()

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geoCache.get(key)
  if (hit) return hit as T
  const g = make()
  geoCache.set(key, g)
  return g
}

export const GEO = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** Low-poly sphere: chunky is the aesthetic, not a compromise. */
  sphere: () => cached('sphere', () => new THREE.SphereGeometry(0.5, 10, 7)),
  blob: () => cached('blob', () => new THREE.SphereGeometry(0.5, 8, 6)),
  cone: () => cached('cone', () => new THREE.ConeGeometry(0.5, 1, 8)),
  cone4: () => cached('cone4', () => new THREE.ConeGeometry(0.5, 1, 4)),
  cylinder: () => cached('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
  taper: () => cached('taper', () => new THREE.CylinderGeometry(0.5, 0.18, 1, 8)),
  disc: () => cached('disc', () => new THREE.CircleGeometry(0.5, 16)),
  plane: () => cached('plane', () => new THREE.PlaneGeometry(1, 1)),
  /**
   * A closed, flattened plate for frills and shells.
   *
   * It has to be closed. Inverted-hull outlining works by drawing a swollen
   * copy with the front faces culled, so an open surface — a hemisphere with no
   * cap — leaves its own backside facing the camera and the "outline" renders
   * as a solid black shell over the animal.
   */
  plate: () => cached('plate', () => new THREE.SphereGeometry(0.5, 12, 7)),
} as const

export function disposeArtCaches(): void {
  for (const g of geoCache.values()) g.dispose()
  geoCache.clear()
  for (const m of toonCache.values()) m.dispose()
  toonCache.clear()
  for (const m of flatCache.values()) m.dispose()
  flatCache.clear()
  for (const m of outlineCache.values()) m.dispose()
  outlineCache.clear()
  gradientCache?.dispose()
  gradientCache = null
}
