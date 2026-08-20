import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GEO } from '../toon'
import { PALETTE } from '../palette'
import { Part } from '../Part'
import { GOAD } from '@/core/tuning'
import type { Player } from '@/sim/types'

/**
 * Earl Reagan, trail boss.
 *
 * "Give him a hat that stays on and a coat that swings." The hat is parented to
 * the head and never moves relative to it; the coat is two panels hung off the
 * waist that lag behind his turn and flare with his speed. Between them they do
 * most of the work of making a box with legs read as a man.
 */

export type HatKind = 'trail' | 'stetson' | 'derby' | 'corp' | 'ranger' | 'none'

interface Props {
  player: Player
  hat: HatKind
  /** Counts up while the goad is swinging, for the arm arc. */
  goadSwing: number
  whoopSwing: number
}

/** Hip height. He is about 1.8m to the crown of the hat. */
const HIP = 0.86

/**
 * Reagan is built from parts a quarter of a metre thick, and the outline hull
 * is pushed out far enough at gameplay range to be comparable to that — which
 * leaves a wireframe box hanging around him where the swollen copy escapes its
 * own geometry. Everything on him gets a thinner line than the dinosaurs do.
 */
const INK = 0.55

export function ReaganRig({ player, hat, goadSwing, whoopSwing }: Props) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const legs = useRef<(THREE.Group | null)[]>([])
  const coat = useRef<(THREE.Group | null)[]>([])
  const rifle = useRef<THREE.Group>(null)
  const slung = useRef<THREE.Group>(null)
  const gait = useRef(0)
  const lastYaw = useRef(0)

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    g.position.set(player.pos.x, player.pos.y, player.pos.z)
    g.rotation.y = player.heading
    g.visible = !player.onBike

    const speed = Math.hypot(player.vel.x, player.vel.z)
    gait.current += speed * dt * 1.5
    const phase = gait.current * 3.2
    const airborne = !player.grounded

    if (torso.current) {
      // Bob with the stride, lean into the run, and stay upright while aiming.
      torso.current.position.y = HIP + (airborne ? 0 : Math.abs(Math.sin(phase)) * 0.05)
      const lean = player.aiming ? 0 : Math.min(0.18, speed * 0.018)
      torso.current.rotation.x += (lean - torso.current.rotation.x) * Math.min(1, dt * 8)
      torso.current.rotation.y = Math.sin(phase) * 0.08
    }

    if (head.current) {
      // He looks where the camera looks, within reason.
      const rel = ((player.aimYaw - player.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      head.current.rotation.y += (Math.max(-0.9, Math.min(0.9, rel)) - head.current.rotation.y) * Math.min(1, dt * 10)
      head.current.rotation.x += (-player.aimPitch * 0.5 - head.current.rotation.x) * Math.min(1, dt * 10)
    }

    /* Arms. Aiming brings the rifle up and locks both hands to it; the goad is
       a wide forward shove that has to read from behind at a glance. */
    const goadArc = goadSwing > 0 ? Math.sin((1 - goadSwing / GOAD.cooldown) * Math.PI) : 0
    if (armR.current) {
      const target = player.aiming ? -1.45 : goadArc > 0 ? -1.2 - goadArc * 0.9 : Math.sin(phase) * 0.55
      armR.current.rotation.x += (target - armR.current.rotation.x) * Math.min(1, dt * 14)
    }
    if (armL.current) {
      const whoop = whoopSwing > 0 ? -2.1 : 0
      const target = whoop || (player.aiming ? -1.3 : -Math.sin(phase) * 0.55)
      armL.current.rotation.x += (target - armL.current.rotation.x) * Math.min(1, dt * 14)
    }
    // Rifle in hand only while aiming; slung across his back the rest of the
    // time, which is nearly all of it if the player is playing well.
    if (rifle.current) {
      rifle.current.visible = player.aiming
      rifle.current.rotation.x = player.aiming ? -player.aimPitch : 0
    }
    if (slung.current) slung.current.visible = !player.aiming

    for (let i = 0; i < 2; i++) {
      const leg = legs.current[i]
      if (!leg) continue
      leg.rotation.x = airborne
        ? i === 0
          ? -0.6
          : 0.35
        : Math.sin(phase + i * Math.PI) * Math.min(0.85, 0.04 + speed * 0.1)
    }

    /* The coat. It lags the turn and flares with speed — cheap, and it is most
       of the reason a walking box looks like a cowboy. */
    const yawDelta = ((player.heading - lastYaw.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    lastYaw.current = player.heading
    for (let i = 0; i < 2; i++) {
      const panel = coat.current[i]
      if (!panel) continue
      const flare = Math.min(0.7, speed * 0.06) + (airborne ? 0.35 : 0)
      panel.rotation.x += (flare - panel.rotation.x) * Math.min(1, dt * 6)
      panel.rotation.y += (-yawDelta * 6 - panel.rotation.y) * Math.min(1, dt * 8)
      panel.rotation.z = Math.sin(phase + i * Math.PI) * 0.12
    }
  })

  return (
    <group ref={root}>
      <group ref={torso} position={[0, HIP, 0]}>
        {/* shirt under a heavy trail coat */}
        <Part
            outlineThickness={INK} geo={GEO.box()} color={PALETTE.shirt} position={[0, 0.3, 0]} scale={[0.46, 0.6, 0.3]} />
        <Part geo={GEO.box()} color={PALETTE.coat} position={[0, 0.3, -0.02]} scale={[0.52, 0.56, 0.36]} outlineThickness={1.1} />
        {/* Trans-Time badge: the corporation's colours on his own chest */}
        <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0.16, 0.4, 0.19]} scale={[0.11, 0.11, 0.02]} outline={false} />
        <Part geo={GEO.box()} color={PALETTE.corpYellow} position={[0.16, 0.4, 0.2]} scale={[0.05, 0.05, 0.02]} outline={false} />

        {/* The rifle rides on his back until it is wanted. Slung, it reads as a
            trail boss; in his hands it reads as a man in trouble, which is the
            distinction the whole game is about. */}
        <group ref={slung} position={[0, 0.28, -0.22]} rotation={[0, 0, 0.7]}>
          <Part geo={GEO.box()} color={PALETTE.hat} scale={[0.09, 0.9, 0.11]} outlineThickness={0.9} />
          <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 0.38, 0]} scale={[0.1, 0.22, 0.12]} outline={false} />
        </group>

        {/* --------------------------------------------------------- head */}
        <group ref={head} position={[0, 0.76, 0]}>
          <Part
            outlineThickness={INK} geo={GEO.box()} color={PALETTE.skin} scale={[0.28, 0.3, 0.26]} />
          <Part geo={GEO.box()} color="#120e0a" position={[-0.07, 0.02, 0.14]} scale={[0.06, 0.06, 0.02]} outline={false} />
          <Part geo={GEO.box()} color="#120e0a" position={[0.07, 0.02, 0.14]} scale={[0.06, 0.06, 0.02]} outline={false} />
          {/* the moustache of a man who has been doing this too long */}
          <Part geo={GEO.box()} color={PALETTE.hat} position={[0, -0.08, 0.14]} scale={[0.17, 0.045, 0.03]} outline={false} />
          <Hat kind={hat} />
        </group>

        {/* ---------------------------------------------------- right arm */}
        <group ref={armR} position={[0.31, 0.5, 0]}>
          <Part
            outlineThickness={INK} geo={GEO.box()} color={PALETTE.coat} position={[0, -0.24, 0]} scale={[0.15, 0.5, 0.15]} />
          <Part geo={GEO.box()} color={PALETTE.skin} position={[0, -0.5, 0]} scale={[0.13, 0.12, 0.13]} outline={false} />

          {/* The goad, always in his hand, angled forward and down. It is the
              free, quiet weapon and the one a good player uses most, so he
              should visibly be carrying it at all times. */}
          <group position={[0, -0.52, 0.02]} rotation={[0.55, 0, 0]}>
            <Part geo={GEO.cylinder()} color={PALETTE.goadPole} position={[0, 0, 0.5]} rotation={[Math.PI * 0.5, 0, 0]} scale={[0.05, 1.15, 0.05]} outlineThickness={0.8} />
            <Part geo={GEO.cone()} color={PALETTE.goadTip} position={[0, 0, 1.06]} rotation={[Math.PI * 0.5, 0, 0]} scale={[0.1, 0.24, 0.1]} outline={false} />
          </group>

          {/* The rifle, brought up into both hands only while aiming. */}
          <group ref={rifle} position={[-0.24, -0.5, 0.16]}>
            <Part geo={GEO.box()} color={PALETTE.hat} position={[0, 0, 0.3]} scale={[0.09, 0.11, 0.9]} outlineThickness={0.9} />
            <Part geo={GEO.cylinder()} color={PALETTE.corpBlue} position={[0, 0.02, 0.76]} rotation={[Math.PI * 0.5, 0, 0]} scale={[0.08, 0.4, 0.08]} outline={false} />
            <Part geo={GEO.box()} color={PALETTE.corpYellow} position={[0, 0.09, 0.18]} scale={[0.06, 0.05, 0.26]} outline={false} />
          </group>
        </group>

        {/* ----------------------------------------------------- left arm */}
        <group ref={armL} position={[-0.31, 0.5, 0]}>
          <Part
            outlineThickness={INK} geo={GEO.box()} color={PALETTE.coat} position={[0, -0.24, 0]} scale={[0.15, 0.5, 0.15]} />
          <Part geo={GEO.box()} color={PALETTE.skin} position={[0, -0.5, 0]} scale={[0.13, 0.12, 0.13]} outline={false} />
        </group>

        {/* --------------------------------------------------------- coat */}
        {/* Hung from the waist and stopping well clear of his boots. It swings
            with the turn and flares with speed, and between the coat and the
            hat it is most of what makes a walking box read as a cowboy. */}
        {[-1, 1].map((s, i) => (
          <group
            key={s}
            ref={(el) => {
              coat.current[i] = el
            }}
            position={[0.13 * s, 0.02, -0.06]}
          >
            <Part geo={GEO.box()} color={PALETTE.coatDark} position={[0, -0.22, 0]} scale={[0.3, 0.46, 0.13]} outlineThickness={1.1} />
          </group>
        ))}
      </group>

      {/* ---------------------------------------------------------- legs */}
      {[-0.14, 0.14].map((x, i) => (
        <group
          key={i}
          ref={(el) => {
            legs.current[i] = el
          }}
          position={[x, HIP, 0]}
        >
          <Part
            outlineThickness={INK} geo={GEO.box()} color={PALETTE.denim} position={[0, -HIP * 0.5, 0]} scale={[0.19, HIP, 0.19]} />
          <Part geo={GEO.box()} color={PALETTE.boot} position={[0, -HIP + 0.07, 0.05]} scale={[0.21, 0.15, 0.3]} outline={false} />
        </group>
      ))}
    </group>
  )
}

/* ----------------------------------------------------------------- hats */

export const HATS: { id: HatKind; name: string; price: number; blurb: string }[] = [
  { id: 'trail', name: 'Trail Hat', price: 0, blurb: 'The one he came with. Sweat-stained and honest.' },
  { id: 'stetson', name: 'Carver White', price: 400, blurb: 'What a man wears when he owns the town.' },
  { id: 'derby', name: 'Company Derby', price: 600, blurb: 'Head office issue. Nobody out here respects it.' },
  { id: 'corp', name: 'Trans-Time Cap', price: 800, blurb: 'Cobalt blue. Hazard yellow. Cheerful.' },
  { id: 'ranger', name: "Ranger's Wide-Brim", price: 1200, blurb: 'Twenty rangers lost. This one came back.' },
  { id: 'none', name: 'Bare Head', price: 200, blurb: 'Reagan advises against it.' },
]

function Hat({ kind }: { kind: HatKind }) {
  if (kind === 'none') return null

  const spec = {
    trail: { brim: 0.5, crown: 0.26, height: 0.2, colour: PALETTE.hat, band: PALETTE.coatDark },
    stetson: { brim: 0.6, crown: 0.28, height: 0.28, colour: '#e8e2d2', band: PALETTE.hat },
    derby: { brim: 0.36, crown: 0.27, height: 0.2, colour: '#2a2420', band: PALETTE.corpRed },
    corp: { brim: 0.4, crown: 0.28, height: 0.15, colour: PALETTE.corpBlue, band: PALETTE.corpYellow },
    ranger: { brim: 0.72, crown: 0.27, height: 0.23, colour: '#5a4a34', band: PALETTE.corpYellow },
  }[kind]

  return (
    <group position={[0, 0.19, 0]}>
      <Part
            outlineThickness={INK} geo={GEO.cylinder()} color={spec.colour} scale={[spec.brim, 0.05, spec.brim]} />
      <Part
            outlineThickness={INK} geo={GEO.cylinder()} color={spec.colour} position={[0, spec.height * 0.5, 0]} scale={[spec.crown, spec.height, spec.crown]} />
      <Part
        geo={GEO.cylinder()}
        color={spec.band}
        position={[0, spec.height * 0.18, 0]}
        scale={[spec.crown * 1.06, spec.height * 0.28, spec.crown * 1.06]}
        outline={false}
      />
    </group>
  )
}

/* ------------------------------------------------------------ hover bike */

export function HoverBikeRig({ player, parked }: { player: Player; parked?: { x: number; y: number; z: number } }) {
  const root = useRef<THREE.Group>(null)
  const rider = useRef<THREE.Group>(null)

  useFrame((state) => {
    const g = root.current
    if (!g) return
    if (player.onBike) {
      g.position.set(player.pos.x, player.pos.y, player.pos.z)
      g.rotation.y = player.heading
      // Banks into the turn, and noses down under acceleration.
      g.rotation.z = -player.vel.x * 0.01
      g.rotation.x = -player.bikeSpeed * 0.006
    } else if (parked) {
      g.position.set(parked.x, parked.y + 1.1, parked.z)
      g.rotation.y += (0.6 - g.rotation.y) * 0.08
      g.rotation.x *= 0.9
      g.rotation.z *= 0.9
    }
    g.position.y += Math.sin(state.clock.elapsedTime * 3) * 0.06
    if (rider.current) rider.current.visible = player.onBike
  })

  return (
    <group ref={root}>
      <Part geo={GEO.sphere()} color={PALETTE.corpWhite} scale={[0.7, 0.4, 2.4]} outlineThickness={1.3} />
      <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 0.12, -0.2]} scale={[0.74, 0.22, 1.4]} outline={false} />
      <Part geo={GEO.cone4()} color={PALETTE.corpYellow} position={[0, 0, 1.35]} rotation={[Math.PI * 0.5, 0, Math.PI * 0.25]} scale={[0.5, 0.7, 0.4]} outline={false} />
      {/* the thruster pods, and their glow */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0.62 * s, -0.1, -0.5]}>
          <Part
            outlineThickness={INK} geo={GEO.cylinder()} color={PALETTE.corpWhite} rotation={[Math.PI * 0.5, 0, 0]} scale={[0.28, 1.3, 0.28]} />
          <Part geo={GEO.disc()} color={PALETTE.stunBeam} position={[0, -0.24, 0]} rotation={[Math.PI * 0.5, 0, 0]} scale={0.42} flat outline={false} opacity={0.75} />
        </group>
      ))}
      <group ref={rider} position={[0, 0.55, -0.15]}>
        <Part
            outlineThickness={INK} geo={GEO.box()} color={PALETTE.coat} scale={[0.55, 0.6, 0.36]} />
        <Part
            outlineThickness={INK} geo={GEO.box()} color={PALETTE.skin} position={[0, 0.5, 0]} scale={[0.32, 0.34, 0.3]} />
        <Part
            outlineThickness={INK} geo={GEO.cylinder()} color={PALETTE.hat} position={[0, 0.7, 0]} scale={[0.6, 0.05, 0.6]} />
        <Part
            outlineThickness={INK} geo={GEO.cylinder()} color={PALETTE.hat} position={[0, 0.82, 0]} scale={[0.3, 0.24, 0.3]} />
      </group>
    </group>
  )
}
