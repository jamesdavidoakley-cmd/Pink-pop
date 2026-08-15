/**
 * The free-play yard: any ground, any hill, any load, no objective, no timer,
 * nothing to win. Build something silly and see what happens to it.
 */

import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { GripMeter, type GripSnapshot } from '../components/GripMeter'
import { BigButton, Panel, PressBar, StickyPips } from '../components/ui'
import { speak } from '../a11y/narration'
import { configureFreePlay, FREE_PLAY, type CrateSpec } from '../game/levels'
import { hardestPoint } from '../game/analysis'
import { useGame, usePlayer } from '../state/store'
import { SURFACE_IDS, ZONES, type SurfaceId, type Zone } from '../physics/constants'
import { loadOnDrive, type Rig } from '../physics/model'
import { SURFACE_COLOURS, SURFACE_NAME } from '../theme'
import { useRef } from 'react'

const CRATE_SIZES = [
  { mass: 500, kind: 'sand' as const, label: 'Light' },
  { mass: 1400, kind: 'brick' as const, label: 'Middling' },
  { mass: 2800, kind: 'pipe' as const, label: 'Heavy' },
]

export function FreePlayBay() {
  const { go, reducedMotion } = useGame()
  const { profile } = usePlayer()

  const [surface, setSurface] = useState<SurfaceId>('gravel')
  const [grade, setGrade] = useState(0.1)
  const [bends, setBends] = useState(false)
  const [load, setLoad] = useState<{ id: string; mass: number; kind: CrateSpec['kind']; zone: Zone }[]>([])
  const [nextId, setNextId] = useState(1)
  const snapshot = useRef<GripSnapshot>({ grip: 0, demand: 0, slipping: false })

  const rig: Rig = useMemo(
    () => ({
      crates: load.map((c) => ({ ...c, secured: false })),
      tyres: profile.fitted.tyres,
      wheelWeights: profile.fitted.wheelWeights,
      liftAxleRaised: false,
      ballastKg: 0,
      mudOnCabKg: 0,
    }),
    [load, profile.fitted],
  )

  const preview = useMemo(() => {
    configureFreePlay({ surface, grade, bends, crates: [] })
    return hardestPoint(FREE_PLAY, rig)
  }, [surface, grade, bends, rig])

  snapshot.current = {
    grip: preview.budget.gripFraction,
    demand: preview.budget.demandFraction,
    slipping: preview.margin < 0,
  }

  const addCrate = (spec: (typeof CRATE_SIZES)[number], zone: Zone) => {
    setLoad((current) => [...current, { id: `f${nextId}`, mass: spec.mass, kind: spec.kind, zone }])
    setNextId((n) => n + 1)
  }

  const build = () => {
    configureFreePlay({
      surface,
      grade,
      bends,
      crates: load.map((c) => ({ id: c.id, mass: c.mass, kind: c.kind, secured: false })),
    })
    const placement: Record<string, Zone> = {}
    for (const c of load) placement[c.id] = c.zone
    speak('Off you go. Break whatever you like.', { force: true })
    go({ k: 'drive', levelId: 'free', runIndex: 0, carried: [], placement, predictionCorrect: null })
  }

  return (
    <div className="flex h-full w-full flex-col bg-paper p-3">
      <header className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go({ k: 'yard' })}
          className="toy-sm rounded-2xl bg-card px-3 py-3 text-slate-deep"
          aria-label="Back to the yard"
        >
          <Icon name="back" className="h-6 w-6" />
        </button>
        <h1 className="signwritten-centred text-4xl text-haulage">Your yard</h1>
        <div className="w-12" />
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
          <Panel className="p-3">
            <h2 className="signwritten mb-2 text-xl text-slate-deep">The ground</h2>
            <div className="flex flex-wrap gap-2">
              {SURFACE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSurface(id)
                    speak(SURFACE_NAME[id], { force: true })
                  }}
                  className={`toy-sm flex w-24 flex-col items-center gap-1 rounded-2xl p-2 ${
                    surface === id ? 'bg-hivis' : 'bg-card'
                  }`}
                >
                  <span
                    className="h-9 w-full rounded-lg border-[3px] border-slate-deep"
                    style={{ background: SURFACE_COLOURS[id].top }}
                  />
                  <span className="text-xs leading-tight text-slate-deep">{SURFACE_NAME[id]}</span>
                  <StickyPips surface={id} />
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="p-3">
            <h2 className="signwritten mb-2 text-xl text-slate-deep">The hill</h2>
            <div className="flex items-center gap-3">
              <Icon name="lorry" className="h-8 w-8 shrink-0 text-slate-deep" />
              <input
                type="range"
                min={0}
                max={0.34}
                step={0.02}
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
                className="h-8 flex-1 accent-[#FF6A13]"
                aria-label="How steep"
              />
              <span
                aria-hidden
                className="h-10 w-10 shrink-0 border-b-[5px] border-l-[5px] border-slate-deep"
                style={{ transform: `rotate(${-grade * 90}deg)` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setBends(!bends)}
              aria-pressed={bends}
              className={`toy-sm mt-3 rounded-xl px-4 py-3 ${bends ? 'bg-hivis' : 'bg-card'}`}
            >
              <span className="signwritten-centred text-xl text-slate-deep">Bends</span>
            </button>
          </Panel>

          <Panel className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="signwritten text-xl text-slate-deep">The load</h2>
              {load.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setLoad([])}
                  className="toy-sm rounded-xl bg-card px-3 py-2 text-sm text-slate-deep"
                >
                  Tip it all off
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ZONES.map((zone) => (
                <div key={zone} className="rounded-2xl border-4 border-dashed border-slate-deep/25 p-2">
                  <p className="mb-2 text-center text-xs text-slate-deep/70">
                    {zone === 'over_cab' ? 'Front' : zone === 'middle' ? 'Middle' : 'Back'}
                  </p>
                  <div className="mb-2 flex min-h-[34px] flex-wrap justify-center gap-1">
                    {load
                      .filter((c) => c.zone === zone)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setLoad((current) => current.filter((x) => x.id !== c.id))}
                          className="h-7 rounded border-2 border-slate-deep bg-mud"
                          style={{ width: 12 + c.mass / 120 }}
                          aria-label="Take this one off"
                        />
                      ))}
                  </div>
                  <div className="flex justify-center gap-1">
                    {CRATE_SIZES.map((spec) => (
                      <button
                        key={spec.label}
                        type="button"
                        onClick={() => addCrate(spec, zone)}
                        className="toy-sm rounded-lg bg-card px-2 py-1 text-xs text-slate-deep"
                        aria-label={`Add a ${spec.label.toLowerCase()} one`}
                      >
                        +{spec.label[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex w-[230px] shrink-0 flex-col gap-3">
          <Panel className="p-3">
            <PressBar value={loadOnDrive(rig, preview.conditions, 0) / 6200} />
          </Panel>
          <Panel className="flex flex-1 items-center justify-center gap-2 p-3">
            <GripMeter
              snapshotRef={snapshot}
              reducedMotion={reducedMotion}
              compact
              className="h-full max-h-[220px] min-h-[130px] w-[76px]"
            />
            <p className="signwritten w-24 text-lg leading-tight text-slate-deep">
              {preview.margin >= 0 ? 'Should hold' : 'It will spin'}
            </p>
          </Panel>
          <BigButton tone="orange" icon="play" label="Build it" onClick={build} />
        </div>
      </div>
    </div>
  )
}
