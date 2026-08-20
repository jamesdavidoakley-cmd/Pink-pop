import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GEO, flatMaterial, toonGradient } from '@/art/toon'
import { PALETTE } from '@/art/palette'
import { Part } from '@/art/Part'
import { ReaganRig, type HatKind } from '@/art/rigs/Reagan'
import { approachAngle, clamp, damp, headingOf, len2 } from '@/core/math'
import { PLAYER } from '@/core/tuning'
import type { Player } from '@/sim/types'

/**
 * The Trans-Time Commissary: the room between drives.
 *
 * A vending counter, a mission board and a jukebox, in a box of corporate white
 * and cobalt with a strip light. It is the one place in the game where the
 * clean colours are not out of place, which is exactly why the badlands
 * outside look the way they do.
 *
 * Reagan walks around it with a cut-down version of his own controller — no
 * simulation, no terrain, just a man in a room — and standing at a station
 * opens it.
 */

export type Station = 'counter' | 'board' | 'jukebox' | null

const ROOM = { width: 26, depth: 21, height: 7 }

const STATIONS: { id: Exclude<Station, null>; x: number; z: number; label: string }[] = [
  { id: 'counter', x: -8, z: -8.6, label: 'VENDING' },
  { id: 'board', x: 8, z: -8.6, label: 'MISSION BOARD' },
  { id: 'jukebox', x: 10.5, z: 3, label: 'JUKEBOX' },
]

/** Generous, because walking a cowboy into a counter is not the game. */
const REACH = 5.5

export function CommissaryCanvas({
  hat,
  onStation,
  onActivate,
}: {
  hat: HatKind
  onStation: (station: Station) => void
  onActivate: (station: Exclude<Station, null>) => void
}) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 7, 14], fov: 55, near: 0.1, far: 200 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#141018'))
      }}
    >
      <CommissaryRoom hat={hat} onStation={onStation} onActivate={onActivate} />
    </Canvas>
  )
}

function CommissaryRoom({
  hat,
  onStation,
  onActivate,
}: {
  hat: HatKind
  onStation: (station: Station) => void
  onActivate: (station: Exclude<Station, null>) => void
}) {
  const { camera } = useThree()
  const [player] = useState<Player>(() => makeRoomPlayer())
  const keys = useRef(new Set<string>())
  const near = useRef<Station>(null)
  const cooldown = useRef(0)

  useMemo(() => {
    const down = (e: KeyboardEvent) => {
      keys.current.add(e.code)
      if ((e.code === 'KeyE' || e.code === 'Enter') && near.current && cooldown.current <= 0) {
        cooldown.current = 0.4
        onActivate(near.current)
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [onActivate])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    cooldown.current = Math.max(0, cooldown.current - dt)
    const k = keys.current

    // Screen-relative, because there is no camera to orbit in here.
    let mx = 0
    let mz = 0
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1
    const l = len2(mx, mz)
    if (l > 0) {
      mx /= l
      mz /= l
    }

    const speed = PLAYER.walkSpeed * 0.7
    player.vel.x = damp(player.vel.x, mx * speed, 12, dt)
    player.vel.z = damp(player.vel.z, mz * speed, 12, dt)
    player.pos.x = clamp(player.pos.x + player.vel.x * dt, -ROOM.width / 2 + 1.2, ROOM.width / 2 - 1.2)
    player.pos.z = clamp(player.pos.z + player.vel.z * dt, -ROOM.depth / 2 + 1.2, ROOM.depth / 2 - 1.2)
    if (l > 0) player.heading = approachAngle(player.heading, headingOf(player.vel.x, player.vel.z), 12 * dt)

    /* ------------------------------------------------------ proximity */
    let found: Station = null
    for (const s of STATIONS) {
      if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < REACH) {
        found = s.id
        break
      }
    }
    if (found !== near.current) {
      near.current = found
      onStation(found)
    }

    /* --------------------------------------------------------- camera */
    /* A fixed-ish arcade camera that drifts with him, rather than a chase cam:
       this is a room, not a level, and the whole room should stay readable.
       Kept below the wall line — at seven and a half metres it looked straight
       over the back wall into the void beyond. */
    const targetX = player.pos.x * 0.42
    const targetZ = player.pos.z * 0.3 + 12.5
    camera.position.x = damp(camera.position.x, targetX, 4, dt)
    camera.position.y = damp(camera.position.y, 5.2, 4, dt)
    camera.position.z = damp(camera.position.z, targetZ, 4, dt)
    camera.lookAt(player.pos.x * 0.45, 1.9, player.pos.z * 0.35 - 2.5)
  })

  return (
    <>
      <directionalLight position={[6, 14, 10]} intensity={2.2} color={PALETTE.corpWhite} />
      <ambientLight intensity={1.1} color="#5a6a8a" />
      <hemisphereLight args={[PALETTE.corpBlue, PALETTE.shadow, 0.5]} />

      <RoomShell />
      <VendingCounter />
      <MissionBoard />
      <Jukebox />

      <ReaganRig player={player} hat={hat} goadSwing={0} whoopSwing={0} />

      {STATIONS.map((s) => (
        <StationMarker key={s.id} x={s.x} z={s.z} label={s.label} player={player} />
      ))}
    </>
  )
}

function makeRoomPlayer(): Player {
  return {
    pos: { x: 0, y: 0, z: 4 },
    vel: { x: 0, y: 0, z: 0 },
    heading: Math.PI,
    aimYaw: Math.PI,
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

/* ------------------------------------------------------------------ room */

function RoomShell() {
  const floor = useMemo(() => {
    const g = new THREE.PlaneGeometry(ROOM.width, ROOM.depth)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const floorMat = useMemo(
    () => new THREE.MeshToonMaterial({ color: new THREE.Color('#c9ccd2'), gradientMap: toonGradient() }),
    [],
  )

  return (
    <group>
      <mesh geometry={floor} material={floorMat} />
      {/* Hazard stripe down the middle of the floor, because Trans-Time. */}
      {[-3, 3].map((x) => (
        <Part key={x} geo={GEO.box()} color={PALETTE.corpYellow} position={[x, 0.02, 0]} scale={[0.3, 0.02, ROOM.depth]} outline={false} />
      ))}

      {/* walls, and a ceiling — without one the camera sees straight over the
          back wall into the clear colour, which reads as the room having no top */}
      <Part geo={GEO.box()} color={PALETTE.corpWhite} position={[0, ROOM.height / 2, -ROOM.depth / 2]} scale={[ROOM.width, ROOM.height, 0.6]} />
      <Part geo={GEO.box()} color="#dfe3e8" position={[-ROOM.width / 2, ROOM.height / 2, 0]} scale={[0.6, ROOM.height, ROOM.depth]} />
      <Part geo={GEO.box()} color="#dfe3e8" position={[ROOM.width / 2, ROOM.height / 2, 0]} scale={[0.6, ROOM.height, ROOM.depth]} />
      <Part geo={GEO.box()} color="#b8bec6" position={[0, ROOM.height, 0]} scale={[ROOM.width, 0.5, ROOM.depth]} outline={false} />
      {/* cobalt band at waist height, all the way round */}
      <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 1.4, -ROOM.depth / 2 + 0.32]} scale={[ROOM.width, 0.5, 0.06]} outline={false} />

      {/* strip lights, flush to the ceiling */}
      {[-6, 0, 6].map((z) => (
        <Part key={z} geo={GEO.box()} color="#fffbe8" position={[0, ROOM.height - 0.3, z]} scale={[9, 0.12, 0.6]} flat outline={false} />
      ))}

      {/* The window: the only view of outside, and it is orange. */}
      <group position={[0, 3.4, -ROOM.depth / 2 + 0.35]}>
        <Part geo={GEO.box()} color={PALETTE.hat} scale={[9.4, 3.2, 0.14]} />
        <Part geo={GEO.box()} color={PALETTE.skyLow} position={[0, 0, 0.09]} scale={[8.8, 2.7, 0.05]} flat outline={false} />
        {/* a distant herd, painted on */}
        {[-2.6, -1.7, 0.4, 1.5, 2.4].map((x, i) => (
          <Part
            key={x}
            geo={GEO.box()}
            color={PALETTE.triceratops}
            position={[x, -0.75 + (i % 2) * 0.08, 0.12]}
            scale={[0.5, 0.24, 0.04]}
            flat
            outline={false}
          />
        ))}
      </group>
    </group>
  )
}

function VendingCounter() {
  return (
    <group position={[-8, 0, -8.6]}>
      <Part geo={GEO.box()} color={PALETTE.corpWhite} position={[0, 0.6, 0]} scale={[5.5, 1.2, 1.6]} />
      <Part geo={GEO.box()} color={PALETTE.corpBlue} position={[0, 1.25, 0]} scale={[5.6, 0.12, 1.7]} outline={false} />
      <Part geo={GEO.box()} color="#2a2a30" position={[0, 2.6, -0.6]} scale={[5.2, 2.4, 0.5]} />
      {/* the goods, on shelves behind */}
      {[-1.6, -0.5, 0.6, 1.7].map((x, i) => (
        <Part
          key={x}
          geo={GEO.box()}
          color={[PALETTE.corpYellow, PALETTE.corpRed, PALETTE.stunBeam, PALETTE.corpWhite][i]!}
          position={[x, 2.6, -0.3]}
          scale={[0.7, 0.9, 0.3]}
          outline={false}
        />
      ))}
      <Part geo={GEO.box()} color={PALETTE.corpYellow} position={[0, 4.1, -0.6]} scale={[4.4, 0.7, 0.2]} />
    </group>
  )
}

function MissionBoard() {
  return (
    <group position={[8, 0, -8.6]}>
      <Part geo={GEO.box()} color={PALETTE.coatDark} position={[0, 2.6, 0]} scale={[5.4, 3.6, 0.3]} />
      <Part geo={GEO.box()} color="#3c3228" position={[0, 2.6, 0.17]} scale={[5.0, 3.2, 0.05]} outline={false} />
      {/* pinned dispatch sheets */}
      {[
        [-1.5, 3.5],
        [0.2, 3.3],
        [1.6, 3.6],
        [-1.2, 2.0],
        [0.6, 1.9],
      ].map(([x, y], i) => (
        <Part
          key={i}
          geo={GEO.box()}
          color={i % 3 === 0 ? PALETTE.corpYellow : PALETTE.corpWhite}
          position={[x!, y!, 0.22]}
          rotation={[0, 0, (i - 2) * 0.06]}
          scale={[1.1, 1.4, 0.03]}
          outline={false}
        />
      ))}
    </group>
  )
}

function Jukebox() {
  const light = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (light.current) {
      const m = light.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.35
    }
  })
  return (
    <group position={[10.5, 0, 3]} rotation={[0, -Math.PI / 2, 0]}>
      <Part geo={GEO.box()} color={PALETTE.corpRed} position={[0, 1.3, 0]} scale={[2.2, 2.6, 1.1]} />
      <Part geo={GEO.cylinder()} color={PALETTE.corpYellow} position={[0, 2.65, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.1, 1.1, 1.1]} />
      <Part geo={GEO.box()} color="#1a1a22" position={[0, 1.5, 0.58]} scale={[1.5, 1.0, 0.06]} outline={false} />
      <mesh ref={light} position={[0, 2.65, 0.6]} material={flatMaterial(PALETTE.corpWhite, { opacity: 0.7 })}>
        <circleGeometry args={[0.35, 12]} />
      </mesh>
    </group>
  )
}

/** A floating prompt over each station, which brightens when you can use it. */
function StationMarker({ x, z, label, player }: { x: number; z: number; label: string; player: Player }) {
  const group = useRef<THREE.Group>(null)
  const sprite = useMemo(() => makeLabel(label), [label])

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const d = Math.hypot(player.pos.x - x, player.pos.z - z)
    const active = d < REACH
    g.position.y = 4.3 + Math.sin(state.clock.elapsedTime * 2 + x) * 0.1
    g.scale.setScalar(active ? 1.15 : 0.9)
    const mat = (g.children[0] as THREE.Sprite).material as THREE.SpriteMaterial
    mat.opacity = active ? 1 : 0.4
  })

  return (
    <group ref={group} position={[x, 4.3, z]}>
      <sprite scale={[4.2, 1.05, 1]}>
        <spriteMaterial map={sprite} transparent depthTest={false} />
      </sprite>
    </group>
  )
}

function makeLabel(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(11,7,5,0.85)'
  ctx.fillRect(0, 0, 512, 128)
  ctx.strokeStyle = '#ffd21f'
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, 506, 122)
  ctx.fillStyle = '#f2f4f6'
  ctx.font = 'bold 40px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 48)
  ctx.font = '26px "Courier New", monospace'
  ctx.fillStyle = '#ffd21f'
  ctx.fillText('[ E ]', 256, 92)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
