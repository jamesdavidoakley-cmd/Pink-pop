/**
 * The drive screen. One thumb on the throttle, and everything the game has to
 * teach happening in the tyre tread on the right hand side.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GripMeter, type GripSnapshot } from '../components/GripMeter'
import { Icon } from '../components/Icon'
import { BigButton } from '../components/ui'
import { audio } from '../audio/engine'
import { speak } from '../a11y/narration'
import { DriveSim, type Outcome } from '../game/driveSim'
import { levelById, type Level, type RunSpec } from '../game/levels'
import { scoreRun } from '../game/xp'
import { drawScene } from '../render/scene'
import { fitCanvas } from '../render/paint'
import { useGame, usePlayer, type Screen } from '../state/store'
import type { Profile } from '../state/save'
import { BALLAST_MAX, type Zone } from '../physics/constants'
import type { Crate, Rig } from '../physics/model'
import { SURFACE_NAME } from '../theme'
import type { XpAward } from '../game/xp'

interface Props {
  levelId: string
  runIndex: number
  placement: Record<string, Zone>
  predictionCorrect: boolean | null
  carried: XpAward[]
}

const DT = 1 / 60

export function DriveScreen({ levelId, runIndex, placement, predictionCorrect, carried }: Props) {
  const { go, reducedMotion } = useGame()
  const { profile, update } = usePlayer()
  const level = levelById(levelId)!
  const run = level.runs[runIndex]!

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const inputs = useRef({ throttle: 0, brake: 0 })
  const snapshot = useRef<GripSnapshot>({ grip: 0, demand: 0, slipping: false })
  const pointers = useRef(new Map<number, 'throttle' | 'brake'>())

  const startingCrates = useMemo(
    () => makeCrates(run, placement),
    // A fresh copy per run, so a retry starts with the cargo back on board.
    [run, placement],
  )

  const sim = useMemo(
    () => new DriveSim(level, run, makeRig(profile.fitted, startingCrates), {
      sandRefills: 3,
      boardsAvailable: 2,
      hasLiftAxle: profile.fitted.liftAxle,
      hasBallast: profile.fitted.ballastTank,
      hasSand: profile.fitted.sandHopper,
      hasBoards: profile.fitted.boards,
      reducedMotion,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [levelId, runIndex],
  )

  const [outcome, setOutcome] = useState<Outcome>('running')
  const [hud, setHud] = useState(() => readHud(sim, inputs.current))
  const [retries, setRetries] = useState(0)

  // ---- the loop ----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = performance.now()
    let accumulator = 0
    let elapsed = 0
    let hudClock = 0

    const frame = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000)
      last = now
      elapsed += delta
      accumulator += delta

      let steps = 0
      while (accumulator >= DT && steps < 6) {
        sim.update(inputs.current)
        accumulator -= DT
        steps++

        for (const event of sim.events) {
          if (event === 'slip-start') audio.slipStart()
          if (event === 'slip-end') audio.thunk()
          if (event === 'tumble') audio.tumble()
          if (event === 'clunk' || event === 'boards') audio.clunk()
          if (event === 'mud-splat' || event === 'shovel') audio.clunk()
        }
      }

      audio.setEngine(
        inputs.current.throttle,
        Math.abs(sim.state.v),
        sim.state.isSlipping,
        sim.state.spin,
        true,
      )

      snapshot.current = sim.snapshot()

      const { w, h } = fitCanvas(canvas, ctx)
      drawScene(ctx, w, h, {
        sim,
        cosmetics: profile.cosmetics,
        reducedMotion,
        time: elapsed,
        braking: inputs.current.brake > 0.05,
      })

      hudClock += delta
      if (hudClock > 0.12) {
        hudClock = 0
        setHud(readHud(sim, inputs.current))
      }

      if (sim.outcome !== 'running') {
        setOutcome(sim.outcome)
        audio.silenceEngine()
        return
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      audio.silenceEngine()
    }
  }, [sim, profile.cosmetics, reducedMotion, retries])

  useEffect(() => {
    speak(run.brief)
    return () => audio.silenceEngine()
  }, [run.brief])

  // ---- controls ----------------------------------------------------------
  const grab = useCallback((event: React.PointerEvent, which: 'throttle' | 'brake') => {
    event.preventDefault()
    audio.start()
    audio.resume()
    pointers.current.set(event.pointerId, which)
    inputs.current[which] = 1
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }, [])

  const release = useCallback((event: React.PointerEvent) => {
    const which = pointers.current.get(event.pointerId)
    if (!which) return
    pointers.current.delete(event.pointerId)
    if (![...pointers.current.values()].includes(which)) inputs.current[which] = 0
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'Space' || e.code === 'ArrowUp') inputs.current.throttle = 1
      if (e.code === 'ArrowDown') inputs.current.brake = 1
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') inputs.current.throttle = 0
      if (e.code === 'ArrowDown') inputs.current.brake = 0
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---- finishing ---------------------------------------------------------
  const finish = useCallback(() => {
    const newSurfaces = countNewSurfaces(sim, profile.seenSurfaces)
    const summary = scoreRun({
      level,
      outcome: sim.outcome,
      stats: sim.stats,
      cratesCarried: run.crates.length,
      predictionCorrect,
      newSurfaces,
      boughtNothing: profile.owned.filter((id) => !id.includes('.')).length === 0,
    })

    // A run you had to restart is still a finished run, just not a clean one.
    const awards = retries > 0 ? summary.awards.filter((a) => a.id !== 'clean') : summary.awards
    const allAwards = [...carried, ...awards]

    update((p) => applyLearning(p, sim, level, summary.succeeded, allAwards))

    const nextRun = summary.succeeded && runIndex + 1 < level.runs.length ? runIndex + 1 : null
    go({
      k: 'results',
      levelId,
      awards: allAwards,
      succeeded: summary.succeeded,
      nextRun,
    } satisfies Screen)
  }, [sim, profile, level, run, predictionCorrect, retries, carried, update, go, levelId, runIndex])

  const retry = useCallback(() => {
    sim.resetTo(sim.checkpoint, makeCrates(run, placement))
    sim.stats.hadWheelspin = true // a restarted run does not count as clean
    setOutcome('running')
    setRetries((n) => n + 1)
  }, [sim, run, placement])

  const speedFraction = Math.min(1, Math.abs(hud.speed) / 16)

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-deep">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* --- top bar ------------------------------------------------------ */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <button
          type="button"
          onClick={() => go({ k: 'yard' })}
          className="toy-sm pointer-events-auto rounded-2xl bg-card px-3 py-3 text-slate-deep"
          aria-label="Back to the yard"
        >
          <Icon name="back" className="h-7 w-7" />
        </button>

        <div className="toy-sm rounded-2xl bg-card/95 px-4 py-2">
          <span className="signwritten-centred text-xl text-slate-deep">
            {SURFACE_NAME[hud.surface]}
          </span>
        </div>

        {sim.boss.kind ? (
          <div className="toy-sm w-44 rounded-2xl bg-card/95 px-3 py-2">
            <div className="h-4 overflow-hidden rounded-full border-2 border-slate-deep bg-slate-soft">
              <div
                className="h-full bg-haulage transition-[width] duration-200"
                style={{ width: `${hud.bossProgress * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="w-11" />
        )}
      </div>

      {/* --- the meter ---------------------------------------------------- */}
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <GripMeter
          snapshotRef={snapshot}
          reducedMotion={reducedMotion}
          showNumbers={profile.settings.showNumbers}
          numbers={hud.numbers}
          className="h-[46vh] max-h-[320px] min-h-[190px] w-[110px]"
        />
      </div>

      {/* --- kit buttons -------------------------------------------------- */}
      <div className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        {profile.fitted.sandHopper ? (
          <KitButton
            icon="sand"
            label={`${hud.sandLeft}`}
            disabled={hud.sandLeft === 0}
            onPress={() => sim.dropSand()}
            ariaLabel="Drop sand"
          />
        ) : null}
        {profile.fitted.liftAxle ? (
          <KitButton
            icon="liftaxle"
            active={hud.liftRaised}
            onPress={() => sim.toggleLiftAxle()}
            ariaLabel="Lift the middle wheels"
          />
        ) : null}
        {profile.fitted.boards ? (
          <KitButton
            icon="boards"
            label={`${hud.boardsLeft}`}
            disabled={hud.boardsLeft === 0 || Math.abs(hud.speed) > 1.2}
            onPress={() => sim.placeBoards()}
            ariaLabel="Put the grip boards down"
          />
        ) : null}
        {sim.boss.kind === 'mudzilla' ? (
          <KitButton
            icon="shovel"
            active={hud.cabMud > 0}
            disabled={hud.cabMud === 0}
            onPress={() => sim.shovelCab()}
            ariaLabel="Shovel the mud off the cab"
          />
        ) : null}
        {(sim.boss.kind || level.objective === 'free') && (
          <KitButton
            icon="crate"
            disabled={Math.abs(hud.speed) > 1.5}
            onPress={() => sim.shiftLoadRearward()}
            ariaLabel="Shift the load towards the back"
          />
        )}
        {profile.cosmetics.horn !== 'none' ? (
          <KitButton
            icon="horn"
            onPress={() => audio.horn(profile.cosmetics.horn)}
            ariaLabel="Sound the horn"
          />
        ) : null}
      </div>

      {/* --- ballast slider ----------------------------------------------- */}
      {profile.fitted.ballastTank ? (
        <div className="absolute bottom-40 left-3 w-32">
          <div className="toy-sm rounded-2xl bg-card px-2 py-2">
            <div className="mb-1 flex items-center gap-1">
              <Icon name="tank" className="h-5 w-5 text-slate-deep" />
              <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-slate-deep bg-slate-soft">
                <div
                  className="h-full bg-ice-dark"
                  style={{ width: `${(hud.ballast / BALLAST_MAX) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="toy-sm flex-1 rounded-lg bg-slate-soft py-2 text-cream"
                onClick={() => sim.setBallast(sim.ballastTarget - 400)}
                aria-label="Let water out"
              >
                −
              </button>
              <button
                type="button"
                className="toy-sm flex-1 rounded-lg bg-haulage py-2 text-cream"
                onClick={() => sim.setBallast(sim.ballastTarget + 400)}
                aria-label="Fill with water"
              >
                +
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- pedals -------------------------------------------------------- */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
        {level.brakeEnabled ? (
          <Pedal
            kind="brake"
            onDown={(e) => grab(e, 'brake')}
            onUp={release}
            active={hud.braking}
          />
        ) : (
          <div className="w-40" />
        )}

        {/* Speed shown as a filling bar, never as a number. */}
        <div className="mb-3 hidden h-4 w-40 overflow-hidden rounded-full border-[3px] border-slate-deep bg-card sm:block">
          <div className="h-full bg-haulage" style={{ width: `${speedFraction * 100}%` }} />
        </div>

        <Pedal kind="throttle" onDown={(e) => grab(e, 'throttle')} onUp={release} active={hud.throttle} />
      </div>

      {/* --- finished ------------------------------------------------------ */}
      {outcome !== 'running' ? (
        <FinishOverlay outcome={outcome} onContinue={finish} onRetry={retry} level={level} />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Pedal({
  kind,
  onDown,
  onUp,
  active,
}: {
  kind: 'throttle' | 'brake'
  onDown: (e: React.PointerEvent) => void
  onUp: (e: React.PointerEvent) => void
  active: boolean
}) {
  const isThrottle = kind === 'throttle'
  return (
    <button
      type="button"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={isThrottle ? 'Hold to go' : 'Hold to stop'}
      className={`toy flex h-32 w-40 select-none items-center justify-center rounded-3xl transition-transform duration-75 ${
        isThrottle ? 'bg-haulage text-cream' : 'bg-hivis text-slate-deep'
      } ${active ? 'translate-y-2 brightness-110' : ''}`}
    >
      <Icon name={isThrottle ? 'play' : 'lock'} className="h-14 w-14" />
    </button>
  )
}

function KitButton({
  icon,
  label,
  onPress,
  disabled,
  active,
  ariaLabel,
}: {
  icon: 'sand' | 'liftaxle' | 'boards' | 'shovel' | 'crate' | 'horn'
  label?: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault()
        if (disabled) return
        audio.start()
        onPress()
      }}
      className={`toy-sm relative flex h-16 w-16 items-center justify-center rounded-2xl disabled:opacity-40 ${
        active ? 'bg-hivis text-slate-deep' : 'bg-card text-slate-deep'
      }`}
    >
      <Icon name={icon} className="h-8 w-8" />
      {label !== undefined ? (
        <span className="signwritten-centred absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-slate-deep bg-slate-deep text-sm text-cream">
          {label}
        </span>
      ) : null}
    </button>
  )
}

function FinishOverlay({
  outcome,
  onContinue,
  onRetry,
  level,
}: {
  outcome: Outcome
  onContinue: () => void
  onRetry: () => void
  level: Level
}) {
  const good = outcome === 'delivered' || outcome === 'parked'
  const message = good
    ? level.isBoss
      ? 'You out-gripped them!'
      : outcome === 'parked'
        ? 'Stopped right in the box.'
        : 'Delivered!'
    : 'Not quite. Have another go from the last post.'

  useEffect(() => {
    speak(message, { force: true })
    if (good) audio.chime(0)
  }, [message, good])

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-deep/70 p-6">
      <div className="toy animate-pop max-w-lg rounded-3xl bg-card p-7 text-center">
        <p className="signwritten-centred mb-5 text-4xl text-slate-deep">{message}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {good ? (
            <BigButton tone="green" icon="tick" label="Next" onClick={onContinue} />
          ) : (
            <>
              <BigButton tone="orange" icon="replay" label="Again" onClick={onRetry} />
              <BigButton tone="slate" label="Finish anyway" onClick={onContinue} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function makeCrates(run: RunSpec, placement: Record<string, Zone>): Crate[] {
  return run.crates.map((c) => ({
    id: c.id,
    mass: c.mass,
    kind: c.kind,
    zone: placement[c.id] ?? 'middle',
    secured: c.secured ?? true,
  }))
}

function makeRig(fitted: { tyres: Rig['tyres']; wheelWeights: boolean }, crates: Crate[]): Rig {
  return {
    crates,
    tyres: fitted.tyres,
    wheelWeights: fitted.wheelWeights,
    liftAxleRaised: false,
    ballastKg: 0,
    mudOnCabKg: 0,
  }
}

function readHud(sim: DriveSim, inputs: { throttle: number; brake: number } = { throttle: 0, brake: 0 }) {
  return {
    surface: sim.surface,
    speed: sim.state.v,
    sandLeft: sim.sandLeft,
    boardsLeft: sim.boardsLeft,
    liftRaised: sim.rig.liftAxleRaised,
    ballast: sim.rig.ballastKg,
    cabMud: sim.cabMud,
    bossProgress: sim.boss.progress,
    braking: inputs.brake > 0.05,
    throttle: inputs.throttle > 0.05,
    numbers: {
      sticky: sim.budget.mu,
      press: sim.budget.loadOnDrive,
      grip: sim.budget.gripAvailable,
      demand: sim.budget.demand,
    },
  }
}

function countNewSurfaces(sim: DriveSim, seen: string[]): number {
  const met = new Set<string>()
  for (const segment of sim.level.track.segments) met.add(segment.surface)
  return [...met].filter((s) => !seen.includes(s)).length
}

/**
 * Turn what happened on the road into what the grown-up panel knows. Mastery is
 * only ever evidenced by behaviour — never by a question.
 */
function applyLearning(
  profile: Profile,
  sim: DriveSim,
  level: Level,
  succeeded: boolean,
  awards: XpAward[],
): Profile {
  const gained = awards.reduce((sum, a) => sum + a.amount, 0)
  const surfaces = new Set(profile.seenSurfaces)
  for (const segment of level.track.segments) surfaces.add(segment.surface)

  const mastery = { ...profile.mastery }
  if (succeeded) mastery[level.teaches] = (mastery[level.teaches] ?? 0) + 1
  if (sim.stats.easedOffToRecover) mastery.recovery = (mastery.recovery ?? 0) + 1
  if (sim.stats.slowedForBend) mastery.budget = (mastery.budget ?? 0) + 1
  if (sim.stats.usedLiftAxle) mastery.press = (mastery.press ?? 0) + 1
  if (sim.stats.movedLoadRearward) mastery.placement = (mastery.placement ?? 0) + 1
  if (sim.stats.shedBallast) mastery['mass-cost'] = (mastery['mass-cost'] ?? 0) + 1
  if (sim.stats.markError !== null && Math.abs(sim.stats.markError) < 5) {
    mastery.stopping = (mastery.stopping ?? 0) + 1
  }

  const previous = profile.levels[level.id]
  return {
    ...profile,
    xp: profile.xp + gained,
    seenSurfaces: [...surfaces],
    mastery,
    levels: {
      ...profile.levels,
      [level.id]: {
        completed: (previous?.completed ?? false) || succeeded,
        cleanRun: (previous?.cleanRun ?? false) || (succeeded && !sim.stats.hadWheelspin),
        cargoIntact: (previous?.cargoIntact ?? false) || (succeeded && sim.stats.cargoLost === 0),
        boughtNothing: previous?.boughtNothing ?? false,
        bestTime:
          succeeded && (previous?.bestTime === null || previous?.bestTime === undefined
            ? true
            : sim.stats.seconds < previous.bestTime)
            ? sim.stats.seconds
            : (previous?.bestTime ?? null),
      },
    },
  }
}
