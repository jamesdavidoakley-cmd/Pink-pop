import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CeratopsianRig } from '@/art/rigs/Ceratopsian'
import { PredatorRig } from '@/art/rigs/Predators'
import { ReaganRig, HATS, type HatKind } from '@/art/rigs/Reagan'
import { toonGradient } from '@/art/toon'
import { PALETTE } from '@/art/palette'
import { HERD } from '@/core/tuning'
import type { HerdAnimal, Player, Predator, PredatorKind } from '@/sim/types'

/**
 * A turntable for every rig in the game, reachable at `?rig`.
 *
 * Judging a procedural animal from gameplay screenshots is hopeless — it is
 * always half behind another one, at the wrong angle, in the wrong light. This
 * puts one of each on a plinth and rotates it. It is dev tooling, it ships
 * because it costs nothing, and it is how the herd stopped looking like a pile
 * of boxes.
 */

export function RigLab() {
  const params = new URLSearchParams(window.location.search)
  const only = params.get('rig')
  // Reagan is one-tenth the mass of a nothosaur, so the framing is a parameter.
  const dist = Number(params.get('d') ?? 13)
  const spacing = Number(params.get('s') ?? 8.5)

  return (
    <div className="absolute inset-0 bg-[#c97a4b]">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.75]}
        gl={{ antialias: true }}
        camera={{ position: [0, dist * 0.28, dist], fov: 46, near: 0.1, far: 400 }}
      >
        {/* Deliberately the same three-light rig and shadow setup the game
            uses. A turntable lit differently from the game is a turntable that
            tells you the wrong thing. */}
        <directionalLight
          castShadow
          position={[52, 34, 78]}
          intensity={3.1}
          color={PALETTE.sun}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
          shadow-camera-far={220}
          shadow-bias={-0.0012}
          shadow-normalBias={0.04}
        />
        <directionalLight position={[-52, 42, -78]} intensity={1.35} color={PALETTE.shadowSoft} />
        <ambientLight intensity={0.46} color={PALETTE.shadow} />
        <hemisphereLight args={[PALETTE.skyLow, PALETTE.shadow, 0.5]} />
        <LabFloor />
        <Turntable only={only} spacing={spacing} />
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 text-sm tracking-[0.2em] text-ink/80">
        RIG LAB — ?rig=herd | rex | oldoneeye | raptor | pteranodon | phobosuchus | bighungry | reagan
      </div>
    </div>
  )
}

function LabFloor() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(400, 400)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const mat = useMemo(
    () => new THREE.MeshToonMaterial({ color: new THREE.Color(PALETTE.groundMid), gradientMap: toonGradient() }),
    [],
  )
  return <mesh geometry={geo} material={mat} receiveShadow />
}

/** A row of plinths, each subject turning on the spot so every angle is seen. */
function Turntable({ only, spacing }: { only: string | null; spacing: number }) {
  const subjects = useMemo(() => buildSubjects(only), [only])
  return (
    <>
      {subjects.map((s, i) => (
        <Spinner key={i} index={i} count={subjects.length} spacing={spacing}>
          {s}
        </Spinner>
      ))}
    </>
  )
}

function Spinner({
  index,
  count,
  spacing,
  children,
}: {
  index: number
  count: number
  spacing: number
  children: React.ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.4 + index * 0.6
  })
  const x = (index - (count - 1) / 2) * spacing
  return (
    <group position={[x, 0, 0]}>
      <group ref={ref}>{children}</group>
    </group>
  )
}

function buildSubjects(only: string | null): React.ReactNode[] {
  const herd: React.ReactNode[] = [
    <CeratopsianRig key="tri" animal={makeAnimal({ kind: 'triceratops', matriarch: true })} />,
    <CeratopsianRig key="sty" animal={makeAnimal({ kind: 'styracosaur' })} />,
    <CeratopsianRig key="juv" animal={makeAnimal({ kind: 'triceratops', juvenile: true })} />,
  ]
  const predator = (kind: PredatorKind) => <PredatorRig key={kind} predator={makePredator(kind)} />
  const reagan = HATS.slice(0, 4).map((h) => (
    <ReaganRig key={h.id} player={makePlayer()} hat={h.id as HatKind} goadSwing={0} whoopSwing={0} />
  ))

  switch (only) {
    case 'herd':
      return herd
    case 'reagan':
      return reagan
    case 'rex':
    case 'oldoneeye':
    case 'raptor':
    case 'pteranodon':
    case 'phobosuchus':
    case 'bighungry':
      return [predator(only)]
    default:
      return [
        ...herd,
        predator('rex'),
        predator('raptor'),
        predator('phobosuchus'),
        reagan[0]!,
      ]
  }
}

function makeAnimal(over: Partial<HerdAnimal>): HerdAnimal {
  return {
    id: Math.floor(Math.random() * 1e6),
    kind: 'triceratops',
    juvenile: false,
    matriarch: false,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 3 },
    heading: 0,
    calm: 100,
    state: 'MOVING',
    panicTimer: 0,
    panicDir: { x: 0, y: 0, z: 1 },
    straggler: false,
    lost: false,
    delivered: false,
    grabbedBy: null,
    gait: 0,
    grazeTarget: { x: 0, y: 0, z: 0 },
    grazeRetarget: 5,
    whoopTimer: 0,
    moveHold: 0,
    scale: over.matriarch ? 1.22 : over.juvenile ? HERD.juvenileScale : 1,
    speedSmoothed: 3,
    ...over,
  }
}

function makePredator(kind: PredatorKind): Predator {
  return {
    id: Math.floor(Math.random() * 1e6),
    kind,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 4 },
    heading: 0,
    state: 'STALK',
    stateTimer: 5,
    targetId: -1,
    hits: 0,
    hitWindow: 0,
    radius: 2.4,
    scale: kind === 'oldoneeye' ? 1.5 : kind === 'bighungry' ? 1.6 : 1,
    staggers: 0,
    neckHits: 0,
    lastSoundAt: null,
    lastSoundTimer: 0,
    spooked: 0,
    marked: false,
    age: 0,
    alive: true,
    altitude: kind === 'pteranodon' ? 6 : 0,
    repath: 0,
    anchor: { x: 0, y: 0, z: 0 },
    gait: 0,
  }
}

function makePlayer(): Player {
  return {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 2 },
    heading: 0,
    aimYaw: 0,
    aimPitch: 0,
    grounded: true,
    coyote: 0,
    jumpBuffered: 0,
    jumpHeld: false,
    stamina: 100,
    staminaHold: 0,
    sprinting: false,
    aiming: false,
    ammo: 8,
    rechargeTimer: 0,
    gunHeat: 0,
    fireTimer: 0,
    goadTimer: 0,
    whoopTimer: 0,
    whoopActive: 0,
    netTimer: 0,
    boomerTimer: 0,
    onBike: false,
    bikeSpeed: 0,
    mountTimer: 0,
  }
}
