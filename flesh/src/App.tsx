import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Scene } from '@/game/Scene'
import type { CameraState } from '@/game/CameraRig'
import { fx } from '@/game/Effects'
import { HUD } from '@/ui/HUD'
import { HerdMap } from '@/ui/HerdMap'
import { BriefingScreen, LevelSelect, PauseScreen, TitleScreen } from '@/ui/Menus'
import { ResultsScreen } from '@/ui/Results'
import { Commissary } from '@/ui/Commissary'
import { LogScreen } from '@/ui/LogScreen'
import { TouchControls } from '@/ui/TouchControls'
import { InputManager } from '@/core/input'
import { audio } from '@/audio/engine'
import { useGame } from '@/state/store'
import type { HatKind } from '@/art/rigs/Reagan'
import { RigLab } from '@/ui/RigLab'
import type { SimEvent } from '@/sim/types'

/**
 * The shell.
 *
 * One persistent Canvas for the drive, one for the commissary, and a stack of
 * DOM overlays on top. The newsprint treatment — grain, a hint of colour
 * separation at the edges, a vignette — lives here rather than in a
 * post-processing pass, because a full-screen shader pass costs more of the
 * frame than the whole effect is worth.
 */

export default function App() {
  // Dev turntable for the procedural rigs. See src/ui/RigLab.tsx.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('rig')) {
    return <RigLab />
  }
  return <GameShell />
}

function GameShell() {
  const screen = useGame((s) => s.screen)
  const world = useGame((s) => s.world)
  const save = useGame((s) => s.save)
  const mapOpen = useGame((s) => s.mapOpen)
  const setMapOpen = useGame((s) => s.setMapOpen)
  const setScreen = useGame((s) => s.setScreen)
  const finishRun = useGame((s) => s.finishRun)
  const pushToast = useGame((s) => s.pushToast)

  const container = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const skyFlash = useRef(0)
  const input = useMemo(() => new InputManager(), [])
  const camera = useMemo<CameraState>(() => ({ yaw: Math.PI, pitch: 0.16, aimYaw: Math.PI, aimPitch: 0 }), [])
  const [briefing, setBriefing] = useState(false)
  const finishing = useRef(false)

  const playing = screen === 'playing' || screen === 'paused'
  const paused = screen === 'paused' || briefing || mapOpen

  /* ------------------------------------------------------- level start */

  useEffect(() => {
    if (screen === 'playing') {
      setBriefing(true)
      finishing.current = false
      fx.clear()
      camera.yaw = Math.PI
      camera.pitch = 0.16
    }
  }, [screen, world, camera])

  const begin = useCallback(() => {
    setBriefing(false)
    audio.ensure()
    audio.resume()
    audio.setMuted(save.muted)
    audio.westernSting()
    if (container.current) input.attach(container.current)
    input.requestLock()
  }, [input, save.muted])

  useEffect(() => {
    if (!playing) {
      input.detach()
      input.exitLock()
    }
    return () => {
      if (!playing) input.detach()
    }
  }, [playing, input])

  /* ------------------------------------------------------------- keys */

  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => {
      if (briefing) return
      if (e.code === 'Tab') {
        e.preventDefault()
        setMapOpen(!useGame.getState().mapOpen)
      }
      if (e.code === 'Escape') {
        setScreen(useGame.getState().screen === 'paused' ? 'playing' : 'paused')
      }
      if (e.code === 'KeyM') {
        audio.setMuted(useGame.getState().toggleMute())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, briefing, setMapOpen, setScreen])

  // Losing the pointer lock means the player has tabbed away or hit Escape.
  // Carrying on simulating a twelve-animal herd they cannot see is not fair.
  useEffect(() => {
    if (!playing) return
    const onLockChange = () => {
      if (!document.pointerLockElement && !briefing && useGame.getState().screen === 'playing') {
        setScreen('paused')
      }
    }
    document.addEventListener('pointerlockchange', onLockChange)
    return () => document.removeEventListener('pointerlockchange', onLockChange)
  }, [playing, briefing, setScreen])

  const resume = useCallback(() => {
    setScreen('playing')
    if (container.current) input.attach(container.current)
    input.requestLock()
  }, [input, setScreen])

  /* ----------------------------------------------------------- events */

  const onEvent = useCallback(
    (event: SimEvent) => {
      if (event.t === 'toast') pushToast(event.text)
      if ((event.t === 'complete' || event.t === 'failed') && !finishing.current) {
        finishing.current = true
        const w = useGame.getState().world
        // A beat before the pay slip, so the last head through the gate lands.
        window.setTimeout(() => {
          if (w) finishRun(w)
        }, 1400)
      }
    },
    [pushToast, finishRun],
  )

  /* -------------------------------------------------- lightning flash */

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      skyFlash.current = Math.max(0, skyFlash.current - 0.045)
      if (flashRef.current) flashRef.current.style.opacity = String(skyFlash.current * 0.42)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={container} className="relative h-full w-full overflow-hidden bg-ink">
      {playing && world && (
        <>
          <Canvas
            dpr={[1, 1.75]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            camera={{ fov: 62, near: 0.5, far: 1400 }}
            onCreated={({ gl, scene, camera: cam }) => {
              gl.setClearColor(new THREE.Color('#c97a4b'))
              // Exposed for the smoke test, which reports the draw-call and
              // triangle budget. Software rendering cannot tell us the frame
              // rate on real hardware, but it can tell us what we are asking of
              // it, and that is the number worth watching.
              ;(window as unknown as { __flesh?: unknown }).__flesh = {
                gl,
                scene,
                cam,
                store: useGame,
              }
            }}
          >
            <Scene
              world={world}
              input={input}
              camera={camera}
              paused={paused}
              hat={save.hat as HatKind}
              droneActive={save.upgrades.drone}
              onEvent={onEvent}
              skyFlash={skyFlash}
            />
          </Canvas>

          {!briefing && !mapOpen && <HUD world={world} camera={camera} />}
          {mapOpen && <HerdMap world={world} camera={camera} />}
          <TouchControls input={input} active={!briefing && screen === 'playing'} />

          {/* newsprint */}
          <div ref={flashRef} className="fx-flash" />
          <div className="fx-separation" />
          <div className="fx-grain" />
          <div className="fx-vignette" />
        </>
      )}

      {playing && briefing && <BriefingScreen onBegin={begin} />}
      {screen === 'paused' && !briefing && <PauseScreen onResume={resume} />}
      {screen === 'title' && <TitleScreen />}
      {screen === 'levelSelect' && <LevelSelect />}
      {screen === 'results' && <ResultsScreen />}
      {screen === 'commissary' && <Commissary />}
      {screen === 'log' && <LogScreen />}
    </div>
  )
}
