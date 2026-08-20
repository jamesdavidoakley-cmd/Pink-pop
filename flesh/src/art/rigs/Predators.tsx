import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GEO, flatMaterial } from '../toon'
import { PALETTE, varyColour } from '../palette'
import { Eyes, Part } from '../Part'
import { OLD_ONE_EYE } from '@/core/tuning'
import type { Predator } from '@/sim/types'

/**
 * The threats.
 *
 * The art direction rule for all of them: "Rexes should read as pushy rather
 * than horrifying, more schoolyard bully than monster." Over-scaled heads,
 * small eyes with big pupils, a heavy two-step stomp. Nothing bleeds and
 * nothing is eaten on screen — a stunned dinosaur flops over and snores.
 */

interface Props {
  predator: Predator
}

export function PredatorRig({ predator }: Props) {
  switch (predator.kind) {
    case 'rex':
    case 'oldoneeye':
      return <TyrannosaurRig predator={predator} />
    case 'raptor':
      return <RaptorRig predator={predator} />
    case 'pteranodon':
      return <PteranodonRig predator={predator} />
    case 'phobosuchus':
      return <PhobosuchusRig predator={predator} />
    case 'bighungry':
      return <NothosaurRig predator={predator} />
    default:
      return null
  }
}

/* -------------------------------------------------- shared state helpers */

/** How far over a stunned animal has flopped, 0..1. */
function flopAmount(p: Predator): number {
  return p.state === 'DOWN' ? 1 : 0
}

/** Rearing back for the wind-up roar, then throwing forward on the lunge. */
function lungePose(p: Predator, telegraph: number): number {
  if (p.state === 'TELEGRAPH') return -0.3 * (1 - Math.max(0, p.stateTimer) / telegraph)
  if (p.state === 'LUNGE') return 0.42
  if (p.state === 'STAGGERED') return 0.2
  return 0
}

/* ---------------------------------------------------------- tyrannosaur */

const REX_LEGS: [number, number][] = [
  [-0.95, -0.1],
  [0.95, -0.1],
]

/**
 * Base height of each body group.
 *
 * These have to be applied inside the frame callback rather than left on the
 * JSX, because the flop animation writes `position.y` outright. Setting the
 * height once in JSX and then damping the same property toward the flop offset
 * sinks the animal through its own legs on the first frame.
 */
const REX_BODY_Y = 2.6
const RAPTOR_BODY_Y = 1.05

function TyrannosaurRig({ predator }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const jaw = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const legs = useRef<(THREE.Group | null)[]>([])
  const zzz = useRef<THREE.Group>(null)
  const flopY = useRef(0)

  const boss = predator.kind === 'oldoneeye'
  // Old One Eye is always exactly herself. Ordinary rexes vary, so a pair
  // arriving together do not look like one animal rendered twice.
  const hide = boss ? PALETTE.oldOneEye : varyColour(PALETTE.rex, predator.id * 17, 0.03, 0.1)
  const belly = boss ? PALETTE.oldOneEyeScar : varyColour(PALETTE.rexBelly, predator.id * 17 + 3, 0.02, 0.08)
  const zTex = useMemo(() => makeSnoreTexture(), [])

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    g.position.set(predator.pos.x, predator.pos.y, predator.pos.z)
    g.rotation.y = predator.heading
    g.scale.setScalar(predator.scale)
    g.visible = predator.alive && predator.state !== 'HIDDEN'

    const speed = Math.hypot(predator.vel.x, predator.vel.z)
    const phase = predator.gait * 5.2
    const flop = flopAmount(predator)

    if (body.current) {
      // Flat on its face, snoring, when stunned. Comedy, not carnage.
      body.current.rotation.z += (flop * Math.PI * 0.48 - body.current.rotation.z) * Math.min(1, dt * 6)
      flopY.current += (-flop * 1.9 - flopY.current) * Math.min(1, dt * 6)
      // The heavy two-step: it heaves once per footfall, not per stride.
      const heave = Math.abs(Math.sin(phase)) * 0.14 * Math.min(1, speed / 6) * (1 - flop)
      body.current.position.y = REX_BODY_Y + flopY.current + heave
      body.current.rotation.x =
        lungePose(predator, boss ? OLD_ONE_EYE.telegraph : 1.2) * (1 - flop) - 0.06
      body.current.rotation.y = Math.sin(phase) * 0.09 * Math.min(1, speed / 6) * (1 - flop)
    }

    if (head.current) {
      const roaring = predator.state === 'TELEGRAPH'
      head.current.rotation.x += ((roaring ? -0.42 : 0.05) - head.current.rotation.x) * Math.min(1, dt * 6)
    }
    if (jaw.current) {
      // Open on the roar and the lunge, shut otherwise.
      const open = predator.state === 'TELEGRAPH' || predator.state === 'LUNGE' || predator.state === 'GRAB'
      jaw.current.rotation.x += ((open ? 0.55 : 0.02) - jaw.current.rotation.x) * Math.min(1, dt * 9)
    }
    if (tail.current) {
      tail.current.rotation.y = Math.sin(phase * 0.5) * 0.3
      tail.current.rotation.x = 0.1 + Math.sin(phase) * 0.06
    }
    for (let i = 0; i < 2; i++) {
      const leg = legs.current[i]
      if (!leg) continue
      leg.rotation.x = Math.sin(phase + i * Math.PI) * Math.min(0.8, 0.1 + speed * 0.075) * (1 - flop)
    }
    if (zzz.current) {
      zzz.current.visible = predator.state === 'DOWN'
      zzz.current.position.y = 3 + ((predator.stateTimer * 0.7) % 1.4)
      const t = (predator.stateTimer * 0.7) % 1.4
      zzz.current.scale.setScalar(0.7 + t * 0.5)
    }
  })

  return (
    <group ref={root}>
      <group ref={body} position={[0, REX_BODY_Y, 0]}>
        {/* Torso, chest and neck as one continuous run of masses. A theropod
            balances on its hips, so the weight sits over the legs and the head
            is carried out in front on a neck thick enough to be believed. */}
        <Part geo={GEO.sphere()} color={hide} position={[0, 0, 0.1]} scale={[1.95, 1.9, 3.1]} outlineThickness={1.5} />
        <Part geo={GEO.sphere()} color={belly} position={[0, -0.62, 0.2]} scale={[1.6, 1.0, 2.5]} outline={false} />
        <Part geo={GEO.sphere()} color={hide} position={[0, 0.32, 1.6]} scale={[1.66, 1.62, 1.7]} outlineThickness={1.4} />

        {/* Old One Eye is a hundred and twenty years old and looks it. */}
        {boss &&
          [
            [0.95, 0.5, 0.3, 1.1],
            [-0.8, 0.1, -0.8, 1.5],
            [0.6, -0.3, 1.2, 0.8],
          ].map(([x, y, z, len], i) => (
            <Part
              key={i}
              geo={GEO.box()}
              color={PALETTE.oldOneEyeScar}
              position={[x! * 1.6, y!, z!]}
              rotation={[0, 0, 0.5 + i]}
              scale={[0.14, 0.07, len!]}
              outline={false}
            />
          ))}

        {/* useless little arms */}
        {[-1, 1].map((s) => (
          <Part
            key={s}
            geo={GEO.taper()}
            color={hide}
            position={[0.95 * s, -0.25, 1.5]}
            rotation={[1.1, 0, 0.3 * s]}
            scale={[0.3, 0.85, 0.3]}
            outline={false}
          />
        ))}

        {/* ---------------------------------------------------- neck & head */}
        <group ref={head} position={[0, 0.95, 2.4]}>
          <Part geo={GEO.sphere()} color={hide} position={[0, 0.12, 0.15]} scale={[1.2, 1.2, 1.3]} outlineThickness={1.3} />
          <Part geo={GEO.sphere()} color={hide} position={[0, 0.42, 0.85]} scale={[1.0, 1.0, 1.0]} outline={false} />

          {/* The over-scaled skull. Chunky, and pushy rather than horrifying. */}
          <Part geo={GEO.sphere()} color={hide} position={[0, 0.62, 1.85]} scale={[1.15, 1.05, 2.1]} outlineThickness={1.4} />
          <Part geo={GEO.sphere()} color={hide} position={[0, 0.5, 2.75]} scale={[0.9, 0.8, 0.9]} outline={false} />

          {/* brow ridges, which is all the menace it needs */}
          {[-1, 1].map((s) => (
            <Part
              key={s}
              geo={GEO.box()}
              color={PALETTE.rexDark}
              position={[0.44 * s, 1.06, 1.65]}
              rotation={[0.1, 0, 0.24 * s]}
              scale={[0.36, 0.22, 1.0]}
              outline={false}
            />
          ))}

          <group ref={jaw} position={[0, 0.24, 1.35]}>
            <Part geo={GEO.sphere()} color={hide} position={[0, -0.16, 0.62]} scale={[0.98, 0.42, 1.9]} outline={false} />
            {/* teeth: a row of little cones, no gore required */}
            {[-3, -2, -1, 1, 2, 3].map((i) => (
              <Part
                key={i}
                geo={GEO.cone()}
                color={PALETTE.horn}
                position={[i * 0.14, 0.02, 0.7 + Math.abs(i) * 0.2]}
                scale={[0.11, 0.24, 0.11]}
                outline={false}
              />
            ))}
          </group>

          {/* Eyes. Small, with big pupils. */}
          {boss ? (
            <>
              {/* her good right eye */}
              <group position={[-0.58, 1.0, 2.05]}>
                <mesh geometry={GEO.sphere()} material={flatMaterial('#f6f2e8')} scale={0.26} />
                <mesh geometry={GEO.sphere()} material={flatMaterial('#120e0a')} scale={0.16} position={[-0.06, 0, 0.1]} />
              </group>
              {/* And the dead white left one. This is the entire boss fight,
                  stated in a single primitive, with no text anywhere. */}
              <group position={[0.58, 1.0, 2.05]}>
                <mesh geometry={GEO.sphere()} material={flatMaterial(PALETTE.deadEye)} scale={0.34} />
                <Part
                  geo={GEO.box()}
                  color={PALETTE.oldOneEyeScar}
                  position={[0.04, 0.08, 0.2]}
                  rotation={[0, 0, 0.7]}
                  scale={[0.1, 1.0, 0.1]}
                  outline={false}
                />
              </group>
            </>
          ) : (
            <Eyes spread={0.56} forward={2.05} height={1.0} size={0.26} />
          )}
        </group>
      </group>

      {/* --------------------------------------------------------- tail */}
      <group ref={tail} position={[0, REX_BODY_Y - 0.1, -1.8]}>
        <Part geo={GEO.taper()} color={hide} position={[0, 0, -1.3]} rotation={[Math.PI * 0.5, 0, 0]} scale={[1.5, 2.8, 1.5]} outlineThickness={1.3} />
        <Part geo={GEO.taper()} color={hide} position={[0, 0.1, -3.2]} rotation={[Math.PI * 0.46, 0, 0]} scale={[0.55, 1.9, 0.55]} outline={false} />
      </group>

      {/* --------------------------------------------------------- legs */}
      {REX_LEGS.map(([x, z], i) => (
        <group
          key={i}
          ref={(el) => {
            legs.current[i] = el
          }}
          position={[x, REX_BODY_Y - 0.15, z]}
        >
          {/* An enormous drumstick thigh. This is where a tyrannosaur keeps
              its weight, and without it the animal reads as a bird on stilts. */}
          <Part geo={GEO.sphere()} color={hide} position={[0, -0.5, -0.25]} scale={[1.15, 1.85, 1.6]} outlineThickness={1.2} />
          <Part geo={GEO.taper()} color={hide} position={[0, -1.55, 0.05]} scale={[0.82, 1.5, 0.82]} outlineThickness={1.0} />
          <Part geo={GEO.box()} color={hide} position={[0, -2.36, 0.3]} scale={[0.72, 0.3, 1.3]} outline={false} />
          {[-1, 0, 1].map((t) => (
            <Part
              key={t}
              geo={GEO.cone4()}
              color={PALETTE.horn}
              position={[t * 0.24, -2.38, 0.98]}
              rotation={[Math.PI * 0.5, 0, 0]}
              scale={[0.16, 0.32, 0.16]}
              outline={false}
            />
          ))}
        </group>
      ))}

      {/* Snoring Zs. Trans-Time operates a strict no-kill policy in the field. */}
      <group ref={zzz} position={[0, 3.4, 0]} visible={false}>
        <sprite scale={[1.5, 1.5, 1]}>
          <spriteMaterial map={zTex} transparent depthWrite={false} />
        </sprite>
      </group>
    </group>
  )
}

/* ---------------------------------------------------------------- raptor */

function RaptorRig({ predator }: Props) {
  // A pack of five identical raptors reads as a bug. These are siblings.
  const hide = varyColour(PALETTE.raptor, predator.id * 23, 0.035, 0.12)
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const legs = useRef<(THREE.Group | null)[]>([])
  const flopY = useRef(0)

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    g.position.set(predator.pos.x, predator.pos.y, predator.pos.z)
    g.rotation.y = predator.heading
    g.visible = predator.alive
    const speed = Math.hypot(predator.vel.x, predator.vel.z)
    const phase = predator.gait * 9
    const flop = flopAmount(predator)
    if (body.current) {
      body.current.rotation.z += (flop * Math.PI * 0.5 - body.current.rotation.z) * Math.min(1, dt * 8)
      flopY.current += (-flop * 0.55 - flopY.current) * Math.min(1, dt * 8)
      const heave = Math.abs(Math.sin(phase)) * 0.07 * Math.min(1, speed / 8) * (1 - flop)
      body.current.position.y = RAPTOR_BODY_Y + flopY.current + heave
      body.current.rotation.x = -0.22 + (predator.state === 'LUNGE' ? 0.3 : 0)
    }
    if (tail.current) tail.current.rotation.y = Math.sin(phase * 0.5) * 0.4
    for (let i = 0; i < 2; i++) {
      const leg = legs.current[i]
      if (!leg) continue
      leg.rotation.x = Math.sin(phase + i * Math.PI) * Math.min(1.1, 0.15 + speed * 0.1) * (1 - flop)
    }
  })

  return (
    <group ref={root}>
      <group ref={body} position={[0, RAPTOR_BODY_Y, 0]}>
        <Part geo={GEO.sphere()} color={hide} scale={[0.66, 0.66, 1.4]} outlineThickness={0.9} />
        {/* the stripes are what let you count a pack at a glance */}
        {[-0.34, 0.0, 0.34].map((z) => (
          <Part
            key={z}
            geo={GEO.box()}
            color={PALETTE.raptorStripe}
            position={[0, 0.22, z]}
            scale={[0.68, 0.16, 0.12]}
            outline={false}
          />
        ))}
        {/* Chest, neck and head as a continuous run of masses — the same
            lesson as the rex: a head on a thin stalk reads as a detached prop
            floating in front of the animal. */}
        <Part geo={GEO.sphere()} color={hide} position={[0, 0.14, 0.62]} scale={[0.58, 0.58, 0.7]} outline={false} />
        <Part geo={GEO.sphere()} color={hide} position={[0, 0.36, 0.94]} scale={[0.4, 0.4, 0.5]} outline={false} />
        <Part geo={GEO.sphere()} color={hide} position={[0, 0.5, 1.18]} scale={[0.34, 0.34, 0.42]} outline={false} />

        {/* skull */}
        <Part geo={GEO.sphere()} color={hide} position={[0, 0.56, 1.5]} scale={[0.34, 0.32, 0.8]} outlineThickness={0.9} />
        <Part geo={GEO.sphere()} color={PALETTE.raptorStripe} position={[0, 0.5, 1.86]} scale={[0.24, 0.2, 0.3]} outline={false} />
        {[-1, 1].map((sx) => (
          <Part
            key={sx}
            geo={GEO.cone()}
            color={PALETTE.horn}
            position={[sx * 0.08, 0.44, 1.78]}
            rotation={[Math.PI, 0, 0]}
            scale={[0.06, 0.16, 0.06]}
            outline={false}
          />
        ))}
        <Eyes spread={0.19} forward={1.42} height={0.68} size={0.13} />
      </group>

      {/* A long counterweight tail — this is the fast one. */}
      <group ref={tail} position={[0, RAPTOR_BODY_Y - 0.02, -0.66]}>
        <Part geo={GEO.taper()} color={hide} position={[0, 0, -0.55]} rotation={[Math.PI * 0.5, 0, 0]} scale={[0.4, 1.1, 0.4]} outlineThickness={0.8} />
        <Part geo={GEO.taper()} color={PALETTE.raptorStripe} position={[0, 0.02, -1.42]} rotation={[Math.PI * 0.48, 0, 0]} scale={[0.16, 0.9, 0.16]} outline={false} />
      </group>

      {[-0.28, 0.28].map((x, i) => (
        <group
          key={i}
          ref={(el) => {
            legs.current[i] = el
          }}
          position={[x, RAPTOR_BODY_Y - 0.12, -0.05]}
        >
          <Part geo={GEO.sphere()} color={hide} position={[0, -0.16, -0.06]} scale={[0.32, 0.56, 0.5]} outline={false} />
          <Part geo={GEO.taper()} color={hide} position={[0, -0.6, 0.02]} scale={[0.19, 0.6, 0.19]} outlineThickness={0.7} />
          <Part geo={GEO.box()} color={PALETTE.raptorStripe} position={[0, -0.9, 0.1]} scale={[0.2, 0.1, 0.42]} outline={false} />
          {/* the one big claw, which never actually takes a head */}
          <Part
            geo={GEO.cone()}
            color={PALETTE.horn}
            position={[0, -0.82, 0.24]}
            rotation={[-0.7, 0, 0]}
            scale={[0.07, 0.26, 0.07]}
            outline={false}
          />
        </group>
      ))}
    </group>
  )
}


/* ------------------------------------------------------------ pteranodon */

function PteranodonRig({ predator }: Props) {
  const root = useRef<THREE.Group>(null)
  const wings = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    const g = root.current
    if (!g) return
    g.position.set(predator.pos.x, predator.pos.y, predator.pos.z)
    g.rotation.y = predator.heading
    g.visible = predator.alive
    const diving = predator.state === 'LUNGE'
    g.rotation.x = diving ? 0.55 : predator.state === 'RECOVER' ? -0.35 : 0
    // Wings fold on the dive and beat on the climb, so a diving shape is
    // instantly different from a cruising one when it is only a silhouette
    // against an orange sky — which is the only way you will ever see it.
    const beat = diving ? -1.1 : Math.sin(predator.gait * 6) * 0.5
    for (let i = 0; i < 2; i++) {
      const w = wings.current[i]
      if (!w) continue
      w.rotation.z = (i === 0 ? 1 : -1) * beat
    }
  })

  return (
    <group ref={root}>
      {/* body */}
      <Part geo={GEO.sphere()} color={PALETTE.pteranodon} scale={[0.62, 0.58, 1.5]} outlineThickness={1.0} />
      <Part geo={GEO.sphere()} color={PALETTE.raptorStripe} position={[0, -0.16, 0.1]} scale={[0.48, 0.34, 1.2]} outline={false} />
      {/* neck and skull */}
      <Part geo={GEO.sphere()} color={PALETTE.pteranodon} position={[0, 0.24, 0.86]} scale={[0.4, 0.4, 0.6]} outline={false} />
      <Part geo={GEO.sphere()} color={PALETTE.pteranodon} position={[0, 0.34, 1.24]} scale={[0.36, 0.34, 0.62]} outlineThickness={0.9} />
      {/* The long beak and the crest that counterweights it. Together they are
          the whole silhouette, so both are exaggerated. */}
      <Part
        geo={GEO.cone4()}
        color={PALETTE.horn}
        position={[0, 0.28, 2.15]}
        rotation={[Math.PI * 0.5, 0, Math.PI * 0.25]}
        scale={[0.2, 1.7, 0.16]}
        outline={false}
      />
      <Part
        geo={GEO.cone4()}
        color={PALETTE.raptorStripe}
        position={[0, 0.66, 0.82]}
        rotation={[-Math.PI * 0.42, 0, 0]}
        scale={[0.1, 1.3, 0.62]}
        outlineThickness={0.9}
      />
      <Eyes spread={0.19} forward={1.5} height={0.46} size={0.12} />

      {/* Tucked-up legs, so it reads as flying rather than as a kite. */}
      {[-1, 1].map((s) => (
        <Part
          key={s}
          geo={GEO.taper()}
          color={PALETTE.pteranodon}
          position={[0.22 * s, -0.26, -0.7]}
          rotation={[1.2, 0, 0]}
          scale={[0.14, 0.9, 0.14]}
          outline={false}
        />
      ))}

      {[0, 1].map((i) => {
        const s = i === 0 ? 1 : -1
        return (
          <group
            key={i}
            ref={(el) => {
              wings.current[i] = el
            }}
            position={[0.4 * s, 0.16, 0.1]}
          >
            {/* Inner and outer panels, swept back, with a leading-edge bone.
                One box per wing spans the whole animal and turns it into a
                plank with a head stuck on the end. */}
            <Part geo={GEO.box()} color={PALETTE.pteranodon} position={[1.15 * s, 0, -0.15]} scale={[2.3, 0.09, 1.5]} outlineThickness={1.0} />
            <group position={[2.3 * s, 0, -0.3]} rotation={[0, -0.3 * s, 0]}>
              <Part geo={GEO.box()} color={PALETTE.pteranodon} position={[1.25 * s, 0, 0]} scale={[2.5, 0.07, 0.95]} outlineThickness={0.9} />
            </group>
            <Part geo={GEO.box()} color={PALETTE.raptorStripe} position={[1.6 * s, 0.06, 0.5]} scale={[3.2, 0.1, 0.16]} outline={false} />
          </group>
        )
      })}
    </group>
  )
}


/* ----------------------------------------------------------- phobosuchus */

function PhobosuchusRig({ predator }: Props) {
  const root = useRef<THREE.Group>(null)
  const jaw = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    g.position.set(predator.pos.x, predator.pos.y, predator.pos.z)
    g.rotation.y = predator.heading
    // Invisible until the herd enters the water. Use the ford and it never
    // appears at all, which is the whole design of that level.
    g.visible = predator.alive && predator.state !== 'HIDDEN'
    // Cruising with only the eyes and the back ridge above the surface.
    g.position.y += predator.state === 'STALK' ? -0.62 : 0
    if (jaw.current) {
      const open = predator.state === 'LUNGE' || predator.state === 'GRAB'
      jaw.current.rotation.x += ((open ? 0.6 : 0.02) - jaw.current.rotation.x) * Math.min(1, dt * 10)
    }
  })

  return (
    <group ref={root}>
      {/* A rounded, deep body. A box this long is a plank with an eye on it. */}
      <Part geo={GEO.sphere()} color={PALETTE.croc} position={[0, 0.72, -0.2]} scale={[1.7, 1.35, 5.0]} outlineThickness={1.3} />
      <Part geo={GEO.sphere()} color={PALETTE.rexBelly} position={[0, 0.26, -0.2]} scale={[1.35, 0.6, 4.2]} outline={false} />

      {/* The armoured ridge. Above water this is all you get for a warning. */}
      {[-2.1, -1.4, -0.7, 0, 0.7, 1.4].map((z) => (
        <Part key={z} geo={GEO.cone4()} color={PALETTE.rexDark} position={[0, 1.34, z]} scale={[0.62, 0.5, 0.62]} outline={false} />
      ))}

      {/* Four short splayed legs. */}
      {[-1, 1].map((s) =>
        [1.6, -1.6].map((z) => (
          <Part
            key={`${s}:${z}`}
            geo={GEO.taper()}
            color={PALETTE.croc}
            position={[1.0 * s, 0.4, z]}
            rotation={[0, 0, Math.PI * 0.35 * s]}
            scale={[0.4, 1.0, 0.4]}
            outline={false}
          />
        )),
      )}

      {/* Head: long snout, and the eyes set on top where a crocodilian keeps
          them, so a submerged one is two bumps on the water. */}
      <Part geo={GEO.sphere()} color={PALETTE.croc} position={[0, 0.68, 3.0]} scale={[1.15, 0.9, 1.8]} outlineThickness={1.2} />
      <Part geo={GEO.sphere()} color={PALETTE.croc} position={[0, 0.6, 4.3]} scale={[0.8, 0.6, 1.4]} outlineThickness={1.0} />
      <group ref={jaw} position={[0, 0.42, 2.9]}>
        <Part geo={GEO.sphere()} color={PALETTE.rexBelly} position={[0, -0.14, 1.3]} scale={[0.9, 0.36, 2.4]} outline={false} />
      </group>
      {[-2, -1, 1, 2].map((i) => (
        <Part
          key={i}
          geo={GEO.cone()}
          color={PALETTE.horn}
          position={[i * 0.24, 0.4, 3.6 + Math.abs(i) * 0.35]}
          rotation={[Math.PI, 0, 0]}
          scale={[0.11, 0.3, 0.11]}
          outline={false}
        />
      ))}
      <Eyes spread={0.42} forward={3.1} height={1.32} size={0.24} />

      {/* tail */}
      <Part geo={GEO.taper()} color={PALETTE.croc} position={[0, 0.66, -3.4]} rotation={[-Math.PI * 0.5, 0, 0]} scale={[1.1, 2.6, 0.8]} outlineThickness={1.1} />
      <Part geo={GEO.taper()} color={PALETTE.croc} position={[0, 0.66, -5.2]} rotation={[-Math.PI * 0.5, 0, 0]} scale={[0.42, 1.6, 0.34]} outline={false} />
    </group>
  )
}


/* -------------------------------------------------- BOSS: Big Hungry */

function NothosaurRig({ predator }: Props) {
  const root = useRef<THREE.Group>(null)
  const neck = useRef<THREE.Group>(null)
  const jaw = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    g.position.set(predator.pos.x, predator.pos.y, predator.pos.z)
    g.rotation.y = predator.heading
    g.scale.setScalar(predator.scale)
    g.visible = predator.alive

    /* The rhythm you read and cross between, made visible: down, up, wind up,
       strike, recover. The height of the body IS the tell. */
    const target =
      predator.state === 'SUBMERGED'
        ? -7.5
        : predator.state === 'RISING'
          ? -2.5
          : predator.state === 'DOWN'
            ? -6
            : -0.5
    g.position.y += target
    if (neck.current) {
      const reach = predator.state === 'LUNGE' ? 1.0 : predator.state === 'TELEGRAPH' ? -0.5 : 0
      neck.current.rotation.x += (reach - neck.current.rotation.x) * Math.min(1, dt * 7)
    }
    if (jaw.current) {
      const open = predator.state === 'LUNGE' || predator.state === 'GRAB' || predator.state === 'TELEGRAPH'
      jaw.current.rotation.x += ((open ? 0.7 : 0.03) - jaw.current.rotation.x) * Math.min(1, dt * 8)
    }
  })

  return (
    <group ref={root}>
      {/* A deep, rounded body rather than a raft: most of it is under the
          water most of the time, and the part that breaks the surface has to
          read as the back of something very large. */}
      <Part geo={GEO.sphere()} color={PALETTE.nothosaur} position={[0, 2.6, 0]} scale={[4.2, 3.8, 7.0]} outlineThickness={1.7} />
      <Part geo={GEO.sphere()} color={PALETTE.nothosaurBelly} position={[0, 1.2, 0.4]} scale={[3.4, 2.2, 5.6]} outline={false} />
      {/* A ridge along the spine, so the surfacing silhouette is not a dome. */}
      {[-2.2, -1.0, 0.2, 1.4].map((z) => (
        <Part key={z} geo={GEO.cone4()} color={PALETTE.rexDark} position={[0, 4.3, z]} scale={[1.0, 1.0, 1.6]} outline={false} />
      ))}

      {/* Four broad paddles. */}
      {[-1, 1].map((s) =>
        [1.9, -1.9].map((z) => (
          <Part
            key={`${s}:${z}`}
            geo={GEO.taper()}
            color={PALETTE.nothosaur}
            position={[3.0 * s, 1.6, z]}
            rotation={[z > 0 ? 0.5 : -0.5, 0, (Math.PI * 0.42) * s]}
            scale={[1.5, 3.4, 0.7]}
            outlineThickness={1.2}
          />
        )),
      )}

      <group ref={neck} position={[0, 3.6, 3.0]}>
        {/* The neck as a run of masses, the way the rex's is. A single tapered
            cylinder at this size renders as a plank. */}
        <Part geo={GEO.sphere()} color={PALETTE.nothosaur} position={[0, 0.5, 0.7]} scale={[1.9, 1.9, 2.2]} outlineThickness={1.5} />
        <Part geo={GEO.sphere()} color={PALETTE.nothosaur} position={[0, 1.5, 2.0]} scale={[1.6, 1.6, 1.9]} outlineThickness={1.4} />
        <Part geo={GEO.sphere()} color={PALETTE.nothosaur} position={[0, 2.5, 3.2]} scale={[1.35, 1.35, 1.6]} outlineThickness={1.3} />

        {/* skull */}
        <Part geo={GEO.sphere()} color={PALETTE.nothosaur} position={[0, 3.1, 4.6]} scale={[1.45, 1.3, 2.6]} outlineThickness={1.5} />
        <Part geo={GEO.sphere()} color={PALETTE.nothosaur} position={[0, 3.0, 5.9]} scale={[1.05, 0.95, 1.1]} outline={false} />
        <group ref={jaw} position={[0, 2.75, 4.0]}>
          <Part geo={GEO.sphere()} color={PALETTE.nothosaurBelly} position={[0, -0.25, 1.1]} scale={[1.25, 0.5, 2.4]} outline={false} />
        </group>
        {/* Teeth, top and bottom. Comically large, and it never closes them on
            anything the player can see. */}
        {[-3, -2, -1, 1, 2, 3].map((i) => (
          <Part
            key={i}
            geo={GEO.cone()}
            color={PALETTE.horn}
            position={[i * 0.26, 2.5, 4.4 + Math.abs(i) * 0.3]}
            rotation={[Math.PI, 0, 0]}
            scale={[0.2, 0.62, 0.2]}
            outline={false}
          />
        ))}
        <Eyes spread={0.72} forward={5.3} height={3.6} size={0.42} />
      </group>
    </group>
  )
}

/* -------------------------------------------------------------- snoring */

function makeSnoreTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, 128, 128)
  ctx.font = 'bold 92px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 10
  ctx.strokeStyle = '#0b0705'
  ctx.strokeText('Z', 64, 66)
  ctx.fillStyle = '#f2f4f6'
  ctx.fillText('Z', 64, 66)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
