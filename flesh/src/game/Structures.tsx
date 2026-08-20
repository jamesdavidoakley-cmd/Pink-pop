import { useMemo } from 'react'
import * as THREE from 'three'
import { PALETTE } from '@/art/palette'
import { GEO, flatMaterial } from '@/art/toon'
import { Part } from '@/art/Part'
import type { World } from '@/sim/types'

/**
 * The two ends of the job: Carver City, where the drive starts, and Trans-Time
 * Base 3, where it finishes.
 *
 * The strip's whole visual joke is corporate cleanliness sitting wrong against
 * sixty-five million years of badlands, and it only lands if the corporation
 * has actual buildings in it. Without these the levels begin and end in empty
 * desert with a signpost, which is a route rather than a place.
 */
export function Structures({ world }: { world: World }) {
  const route = world.level.terrain.route
  const pen = route[0]!
  const gate = route[route.length - 1]!
  const penY = useMemo(() => world.terrain.height(pen.x, pen.z), [world.terrain, pen])
  const gateY = useMemo(() => world.terrain.height(gate.x, gate.z), [world.terrain, gate])

  return (
    <>
      {world.level.index === 0 && <CarverCity x={pen.x} y={penY} z={pen.z} />}
      {world.level.boss === 'oldoneeye' && <BaseThree x={gate.x} y={gateY} z={gate.z} />}
    </>
  )
}

/* ------------------------------------------------------------ Carver City */

/**
 * "the frontier boom town built by rival Claw Carver" — a palisade, a gantry
 * over the road out, and a stock of prefabricated sheds nobody bothered to
 * paint. It sits behind the pen, so the tutorial opens with the town at your
 * back and the badlands in front.
 */
function CarverCity({ x, y, z }: { x: number; y: number; z: number }) {
  const palisade = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2
      // Open on the downtrail side: that is the way out.
      if (a > Math.PI * 0.72 && a < Math.PI * 1.28) continue
      out.push([Math.sin(a) * 52, Math.cos(a) * 52, a])
    }
    return out
  }, [])

  return (
    // Set well back from the pen. Close in, the gantry is simply on top of the
    // player at spawn and the town reads as a wall rather than as a town.
    <group position={[x, y, z + 108]}>
      {palisade.map(([px, pz, a], i) => (
        <Part
          key={i}
          geo={GEO.box()}
          color={i % 4 === 0 ? PALETTE.coat : PALETTE.coatDark}
          position={[px, 2.1, pz]}
          rotation={[0, -a, 0]}
          scale={[1.5, 4.2, 0.5]}
          outlineThickness={0.9}
        />
      ))}

      {/* The gantry over the road out, with the town's name on it. */}
      <group position={[0, 0, -52]}>
        {[-11, 11].map((s) => (
          <Part key={s} geo={GEO.box()} color={PALETTE.coatDark} position={[s, 5, 0]} scale={[2, 10, 2]} />
        ))}
        <Part geo={GEO.box()} color={PALETTE.coatDark} position={[0, 10.4, 0]} scale={[26, 1.6, 1.4]} />
        <SignBoard text="CARVER CITY" position={[0, 12.6, 0]} width={22} background="#8a2b1c" />
      </group>

      {/* Sheds, a water tower and a stack of crates. Nothing is square with
          anything else, because nobody out here has the time. */}
      {[
        [-30, -18, 0.3],
        [-16, -30, -0.2],
        [22, -24, 0.5],
        [34, -6, -0.4],
        [4, -34, 0.1],
      ].map(([sx, sz, rot], i) => (
        <group key={i} position={[sx!, 0, sz!]} rotation={[0, rot!, 0]}>
          <Part geo={GEO.box()} color={i % 2 ? '#7d6a52' : '#6a5a46'} position={[0, 2.4, 0]} scale={[11, 4.8, 8]} outlineThickness={1.1} />
          <Part geo={GEO.box()} color={PALETTE.rockDark} position={[0, 5.2, 0]} scale={[12, 0.8, 9]} outline={false} />
          <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 3.1, 4.1]} scale={[3.4, 1.1, 0.2]} outline={false} />
        </group>
      ))}
      <group position={[-34, 0, -34]}>
        {[-3, 3].map((s) =>
          [-3, 3].map((t) => (
            <Part key={`${s}:${t}`} geo={GEO.box()} color={PALETTE.coatDark} position={[s, 6, t]} scale={[0.9, 12, 0.9]} outline={false} />
          )),
        )}
        <Part geo={GEO.cylinder()} color={PALETTE.corpWhite} position={[0, 14.5, 0]} scale={[9, 5.6, 9]} outlineThickness={1.2} />
        <Part geo={GEO.cone()} color={PALETTE.rockDark} position={[0, 18.4, 0]} scale={[9.6, 3, 9.6]} outline={false} />
      </group>
    </group>
  )
}

/* -------------------------------------------------------- Trans-Time Base 3 */

/**
 * The delivery point: low blast-proof sheds, a receiving dish pointed at the
 * twenty-third century, and the cleanest paint in the Cretaceous.
 */
function BaseThree({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    /* Set back beyond the gate and spread wide, so the buildings frame the
       fence rather than hiding behind it. The last thing you see on the last
       drive should be the company, laid out either side of the way in. */
    <group position={[x, y, z - 62]}>
      {[
        [-52, 4, 18, 8, 14],
        [52, 0, 22, 10, 16],
        [-20, -26, 26, 6, 12],
        [26, -30, 22, 7, 12],
      ].map(([bx, bz, w, h, d], i) => (
        <group key={i} position={[bx!, 0, bz!]}>
          <Part geo={GEO.box()} color={PALETTE.corpWhite} position={[0, h! / 2, 0]} scale={[w!, h!, d!]} outlineThickness={1.2} />
          <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, h! * 0.62, d! / 2 + 0.1]} scale={[w! * 0.9, 1.4, 0.2]} outline={false} />
          <Part geo={GEO.box()} color={PALETTE.corpYellow} position={[0, 0.7, d! / 2 + 0.1]} scale={[w! * 0.9, 0.6, 0.2]} outline={false} />
          {/* Roof vents, so the silhouette is not three plain slabs. */}
          {[-1, 0, 1].map((v) => (
            <Part key={v} geo={GEO.cylinder()} color={PALETTE.rockDark} position={[v * w! * 0.28, h! + 0.9, 0]} scale={[1.6, 1.8, 1.6]} outline={false} />
          ))}
        </group>
      ))}

      {/* The receiving dish. This is the thing the meat goes through. */}
      <group position={[2, 0, -6]} rotation={[0, 0.3, 0]}>
        <Part geo={GEO.cylinder()} color={PALETTE.corpWhite} position={[0, 8, 0]} scale={[2.6, 16, 2.6]} outlineThickness={1.2} />
        <group position={[0, 17, 0]} rotation={[-0.7, 0, 0]}>
          <Part geo={GEO.cone()} color={PALETTE.corpWhite} position={[0, 0, 0]} rotation={[Math.PI, 0, 0]} scale={[16, 7, 16]} outlineThickness={1.3} />
          <Part geo={GEO.cylinder()} color={PALETTE.corpYellow} position={[0, 3.4, 0]} scale={[1.1, 7, 1.1]} outline={false} />
        </group>
      </group>

      {/* Masts with hazard lights, and the company's name where the herd can
          see it, which is the only audience out here that cannot read. */}
      {[-78, 78].map((s) => (
        <group key={s} position={[s, 0, 6]}>
          <Part geo={GEO.box()} color={PALETTE.corpWhite} position={[0, 11, 0]} scale={[1.1, 22, 1.1]} />
          <mesh geometry={GEO.sphere()} material={flatMaterial(PALETTE.corpRed)} position={[0, 22.4, 0]} scale={1.3} />
        </group>
      ))}
      <SignBoard text="TRANS-TIME BASE 3" position={[0, 26, 12]} width={44} background="#1b4fd8" />
    </group>
  )
}

/* ---------------------------------------------------------------- signage */

/**
 * A painted board. The text is drawn to a canvas because a texture is one draw
 * call and a mesh of letters is a hundred.
 */
function SignBoard({
  text,
  position,
  width,
  background,
}: {
  text: string
  position: [number, number, number]
  width: number
  background: string
}) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const ctx = c.getContext('2d')!
    ctx.fillStyle = background
    ctx.fillRect(0, 0, 512, 96)
    ctx.strokeStyle = '#0b0705'
    ctx.lineWidth = 8
    ctx.strokeRect(4, 4, 504, 88)
    ctx.fillStyle = '#f2f4f6'
    ctx.font = 'bold 48px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 52)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [text, background])

  const height = width * (96 / 512)
  return (
    <group position={position}>
      <Part geo={GEO.box()} color={PALETTE.rockDark} scale={[width + 1, height + 0.8, 0.5]} outlineThickness={1.1} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={GEO.plane()} position={[0, 0, 0.28 * s]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} scale={[width, height, 1]}>
          <meshBasicMaterial map={texture} />
        </mesh>
      ))}
    </group>
  )
}
