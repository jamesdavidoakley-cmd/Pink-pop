import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GEO, flatMaterial } from '../toon'
import { PALETTE } from '../palette'
import { Eyes, Part } from '../Part'
import type { HerdAnimal } from '@/sim/types'

/**
 * The stock: triceratops and styracosaurs at roughly half and half, plus
 * juveniles at 60% scale.
 *
 * They have to read as loveable and slightly dim — over-scaled heads, small
 * eyes with big pupils, an exaggerated waddle. Nothing about them should look
 * capable of looking after itself, because the entire game is you looking after
 * them.
 *
 * Two things learned building this. Rounded masses first: a barrel made of
 * boxes reads as luggage no matter what you hang off it, and spheres cost the
 * same. And the frill has to be a *closed* plate — an inverted-hull outline on
 * an open hemisphere is just a black shell over the animal's face.
 *
 * The rig is built once and driven imperatively from `useFrame` against the
 * live simulation object. Nothing here re-renders per frame.
 */

interface Props {
  animal: HerdAnimal
}

/** Hip height and leg length, front and back. Ceratopsians run nose-down. */
const FRONT = { x: 0.66, z: 0.78, hip: 1.2, leg: 1.15 }
const BACK = { x: 0.74, z: -0.9, hip: 1.44, leg: 1.4 }

export function CeratopsianRig({ animal }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const legs = useRef<(THREE.Group | null)[]>([])
  const marker = useRef<THREE.Group>(null)

  const styraco = animal.kind === 'styracosaur'
  const hide = animal.juvenile ? PALETTE.juvenile : styraco ? PALETTE.styracosaur : PALETTE.triceratops
  const frillColour = styraco ? PALETTE.styracosaurFrill : PALETTE.triceratopsFrill
  const brandTexture = useMemo(() => makeBrandTexture(), [])

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return

    g.position.set(animal.pos.x, animal.pos.y, animal.pos.z)
    g.rotation.y = animal.heading
    g.visible = !animal.lost && !animal.delivered
    g.scale.setScalar(animal.scale)

    const speed = animal.speedSmoothed
    const effort = Math.min(1, speed / 3.5)
    const phase = animal.gait * 3.1

    /* The waddle: the body rolls side to side in time with the legs and heaves
       as each pair comes down. Exaggerated on purpose — at forty metres this is
       most of what tells you the herd is moving. */
    if (body.current) {
      body.current.rotation.z = Math.sin(phase) * 0.11 * effort
      body.current.position.y = 1.34 + Math.abs(Math.sin(phase * 2)) * 0.09 * effort
      body.current.rotation.x = -Math.min(0.1, speed * 0.012)
    }

    /* Heads down while grazing, up and swivelling when something is wrong. The
       player must be able to read the herd's state from the silhouette alone,
       at range, without looking at the bar. */
    if (head.current) {
      const target =
        animal.state === 'GRAZING' ? -0.66 : animal.state === 'SKITTISH' ? 0.3 : animal.state === 'PANICKED' ? 0.18 : 0.02
      head.current.rotation.x += (target - head.current.rotation.x) * Math.min(1, dt * 4)
      const swivel = animal.state === 'SKITTISH' ? Math.sin(animal.gait * 5 + animal.id) * 0.36 : 0
      head.current.rotation.y += (swivel - head.current.rotation.y) * Math.min(1, dt * 5)
    }

    if (tail.current) {
      tail.current.rotation.y = Math.sin(phase * 0.5) * 0.24
      tail.current.rotation.x = 0.16 + Math.sin(phase) * 0.06
    }

    for (let i = 0; i < 4; i++) {
      const leg = legs.current[i]
      if (!leg) continue
      // Diagonal pairs, as a four-legged animal actually walks.
      const offset = i === 0 || i === 3 ? 0 : Math.PI
      leg.rotation.x = Math.sin(phase + offset) * (0.1 + effort * 0.42)
    }

    if (marker.current) {
      marker.current.position.y = 3.6 + Math.sin(animal.gait * 1.5) * 0.14
      marker.current.rotation.y += dt * 1.4
    }
  })

  return (
    <group ref={root}>
      <group ref={body} position={[0, 1.34, 0]}>
        {/* One rounded barrel, not a box with lumps stuck on it. */}
        <Part geo={GEO.sphere()} color={hide} scale={[1.62, 1.36, 2.5]} outlineThickness={1.15} />
        {/* Front-heavy, as ceratopsians are, and it gives the push something
            to visibly shove against. */}
        <Part geo={GEO.sphere()} color={hide} position={[0, 0.12, 0.86]} scale={[1.72, 1.5, 1.5]} outlineThickness={1.15} />
        <Part geo={GEO.sphere()} color={hide} position={[0, -0.04, -1.02]} scale={[1.46, 1.28, 1.3]} outline={false} />
        {/* A paler belly, which stops the underside going flat black in the
            toon shading's bottom band. */}
        <Part geo={GEO.sphere()} color={frillColour} position={[0, -0.42, 0]} scale={[1.35, 0.85, 2.1]} outline={false} />

        {/* The matriarch wears the Trans-Time brand on her flank. It is the
            only clean, saturated block on any animal in the game, and it is how
            you pick her out at forty metres. */}
        {animal.matriarch &&
          [-1, 1].map((s) => (
            <mesh
              key={s}
              geometry={GEO.plane()}
              position={[0.82 * s, 0.16, -0.35]}
              rotation={[0, (Math.PI / 2) * s, 0]}
              scale={[0.88, 0.88, 1]}
            >
              <meshBasicMaterial map={brandTexture} transparent depthWrite={false} />
            </mesh>
          ))}

        {/* --------------------------------------------------------- neck */}
        <Part geo={GEO.sphere()} color={hide} position={[0, 0.16, 1.62]} scale={[1.15, 1.0, 0.9]} outline={false} />

        {/* --------------------------------------------------------- head */}
        <group ref={head} position={[0, 0.2, 1.85]}>
          {/*
            The frill: fanned up and back over the neck, the biggest single
            shape on the animal, and the thing that tells the two species apart
            at forty metres. Closed geometry, so the outline behaves.
          */}
          <Part
            geo={GEO.plate()}
            color={frillColour}
            position={[0, 0.62, -0.34]}
            rotation={[-0.46, 0, 0]}
            scale={styraco ? [1.62, 1.5, 0.34] : [2.1, 1.62, 0.36]}
            outlineThickness={1.3}
          />

          {/* skull: rounded, tapering to the beak. A box here reads as a
              packing crate with an eye painted on it. */}
          <Part geo={GEO.sphere()} color={hide} position={[0, 0.04, 0.5]} scale={[0.92, 0.72, 1.3]} outlineThickness={1.1} />
          <Part geo={GEO.sphere()} color={hide} position={[0, 0.02, 0.94]} scale={[0.7, 0.56, 0.72]} outline={false} />
          {/* the parrot beak, which is most of the "slightly dim" */}
          <Part
            geo={GEO.cone4()}
            color={PALETTE.horn}
            position={[0, -0.14, 1.14]}
            rotation={[Math.PI * 0.52, 0, Math.PI * 0.25]}
            scale={[0.46, 0.62, 0.4]}
            outline={false}
          />
          <Part geo={GEO.box()} color={PALETTE.rockDark} position={[0, -0.3, 0.82]} scale={[0.6, 0.16, 0.7]} outline={false} />

          {/* Small eyes, big pupils. */}
          <Eyes spread={0.42} forward={0.78} height={0.2} size={0.2} />

          {/* nose horn — both have one; on the styracosaur it is the feature */}
          <Part
            geo={GEO.cone()}
            color={PALETTE.horn}
            position={[0, 0.3, 0.86]}
            rotation={[-0.42, 0, 0]}
            scale={styraco ? [0.34, 1.25, 0.34] : [0.24, 0.48, 0.24]}
            outline={styraco}
          />

          {/* triceratops: the pair of long brow horns */}
          {!styraco &&
            [-1, 1].map((s) => (
              <Part
                key={s}
                geo={GEO.cone()}
                color={PALETTE.horn}
                position={[0.36 * s, 0.48, 0.34]}
                rotation={[-0.72, 0, -0.2 * s]}
                scale={[0.2, 1.2, 0.2]}
                outlineThickness={0.8}
              />
            ))}

          {/* styracosaur: the ring of spikes around the frill */}
          {styraco &&
            [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((i) => {
              const a = (i / 3.4) * 1.4
              return (
                <Part
                  key={i}
                  geo={GEO.cone()}
                  color={PALETTE.horn}
                  position={[Math.sin(a) * 0.78, 0.72 + Math.cos(a) * 0.78, -0.5]}
                  rotation={[-0.5, 0, -a]}
                  scale={[0.16, 0.82, 0.16]}
                  outline={false}
                />
              )
            })}
        </group>

        {/* --------------------------------------------------------- tail */}
        {/* A short, thick tail with a real taper. Long tails belong to the
            things hunting them. */}
        <group ref={tail} position={[0, -0.12, -1.46]}>
          <Part
            geo={GEO.taper()}
            color={hide}
            position={[0, -0.06, -0.52]}
            rotation={[Math.PI * 0.47, 0, 0]}
            scale={[0.92, 1.15, 0.92]}
            outlineThickness={1.0}
          />
          <Part
            geo={GEO.taper()}
            color={hide}
            position={[0, -0.2, -1.12]}
            rotation={[Math.PI * 0.44, 0, 0]}
            scale={[0.34, 0.7, 0.34]}
            outline={false}
          />
        </group>
      </group>

      {/* ---------------------------------------------------------- legs */}
      {[
        [-FRONT.x, FRONT.z, FRONT.hip, FRONT.leg],
        [FRONT.x, FRONT.z, FRONT.hip, FRONT.leg],
        [-BACK.x, BACK.z, BACK.hip, BACK.leg],
        [BACK.x, BACK.z, BACK.hip, BACK.leg],
      ].map(([x, z, hip, len], i) => (
        <group
          key={i}
          ref={(el) => {
            legs.current[i] = el
          }}
          position={[x!, hip!, z!]}
        >
          {/* A haunch, so the leg grows out of the animal rather than being
              bolted underneath it like a table leg. */}
          <Part geo={GEO.sphere()} color={hide} scale={[0.78, 0.82, 0.86]} outline={false} />
          <Part geo={GEO.taper()} color={hide} position={[0, -len! * 0.5, 0]} scale={[0.62, len!, 0.62]} outlineThickness={0.9} />
          {/* the pad, splayed slightly outward */}
          <Part
            geo={GEO.cylinder()}
            color={PALETTE.horn}
            position={[0, -len! - 0.02, 0.06]}
            scale={[0.5, 0.2, 0.56]}
            outline={false}
          />
        </group>
      ))}

      {/* The matriarch also carries a marker you can see over a rise. */}
      {animal.matriarch && (
        <group ref={marker} position={[0, 3.6, 0]}>
          <mesh
            geometry={GEO.cone()}
            material={flatMaterial(PALETTE.corpYellow)}
            rotation={[Math.PI, 0, 0]}
            scale={[0.44, 0.66, 0.44]}
          />
        </group>
      )}
    </group>
  )
}

/**
 * The Trans-Time brand: a hazard-yellow roundel with the company's initials,
 * drawn to a canvas because a texture is one draw call and a mesh of letters is
 * not.
 */
function makeBrandTexture(): THREE.CanvasTexture {
  const size = 64
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = PALETTE.corpYellow
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#0b0705'
  ctx.stroke()
  ctx.fillStyle = '#0b0705'
  ctx.font = 'bold 26px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('TT', size / 2, size / 2 + 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
