import { useMemo } from 'react'
import * as THREE from 'three'
import { flatMaterial, outlineMaterial, toonMaterial } from './toon'

export interface PartProps {
  geo: THREE.BufferGeometry
  color: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
  /**
   * Whether this piece gets an inked silhouette. Big shapes do; horns, eyes and
   * studs do not — the line reads from the mass, and outlining every stud
   * doubles the mesh count for nothing.
   */
  outline?: boolean
  outlineThickness?: number
  /** Unlit, for signage, beams and anything that should stay a flat block. */
  flat?: boolean
  opacity?: number
  emissive?: string
  renderOrder?: number
}

/**
 * One primitive of a rig: the shaded piece, plus its inverted hull if it is one
 * of the shapes that defines the silhouette.
 */
export function Part({
  geo,
  color,
  position,
  rotation,
  scale,
  outline = true,
  outlineThickness = 1,
  flat = false,
  opacity = 1,
  emissive,
  renderOrder,
}: PartProps) {
  const material = useMemo(
    () => (flat ? flatMaterial(color, { opacity }) : toonMaterial(color, { emissive, opacity })),
    [color, flat, opacity, emissive],
  )
  const ink = useMemo(() => outlineMaterial(outlineThickness), [outlineThickness])

  return (
    <>
      <mesh
        geometry={geo}
        material={material}
        position={position}
        rotation={rotation}
        scale={scale}
        renderOrder={renderOrder}
        /* Only the pieces that define the silhouette cast. Horns, teeth, eyes,
           studs and stripes contribute nothing a shadow map can resolve, and
           each one is a second draw call in the shadow pass — on a twelve-head
           herd that was most of the frame's draw calls for no visible result.
           `outline` already marks exactly the set of parts that matter here. */
        castShadow={!flat && outline}
        receiveShadow={!flat}
      />
      {/* The inverted hull is a size larger than the thing it outlines, so it
          must never cast: it would throw a shadow that does not fit its own
          animal. */}
      {outline && (
        <mesh
          geometry={geo}
          material={ink}
          position={position}
          rotation={rotation}
          scale={scale}
          castShadow={false}
          receiveShadow={false}
        />
      )}
    </>
  )
}

/** Two small spheres: white with an oversized black pupil. Reads as dim and loveable. */
export function Eyes({
  spread,
  forward,
  height,
  size = 0.16,
  pupil = 0.74,
}: {
  spread: number
  forward: number
  height: number
  size?: number
  pupil?: number
}) {
  const sphere = useMemo(() => new THREE.SphereGeometry(0.5, 8, 6), [])
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[spread * s, height, forward]}>
          <mesh geometry={sphere} material={flatMaterial('#f6f2e8')} scale={size} />
          <mesh
            geometry={sphere}
            material={flatMaterial('#120e0a')}
            scale={size * pupil}
            position={[0, 0, size * 0.28]}
          />
        </group>
      ))}
    </>
  )
}
