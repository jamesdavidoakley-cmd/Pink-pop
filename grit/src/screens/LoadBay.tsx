/**
 * The load bay. Three places to put things, and a bar and a tyre tread that
 * both move while you are still deciding.
 *
 * This is where the game does most of its teaching, because the child is making
 * a choice and watching the consequence before they have set off.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { GripMeter, type GripSnapshot } from '../components/GripMeter'
import { Icon } from '../components/Icon'
import { BigButton, Panel, PressBar, SurfaceChip, WeightPips } from '../components/ui'
import { speak } from '../a11y/narration'
import { hardestPoint } from '../game/analysis'
import { levelById } from '../game/levels'
import { CRATE_COLOURS } from '../render/lorry'
import { useGame, usePlayer } from '../state/store'
import { loadOnDrive, type Rig } from '../physics/model'
import { ZONES, type Zone } from '../physics/constants'
import type { XpAward } from '../game/xp'

interface Props {
  levelId: string
  runIndex: number
  carried: XpAward[]
}

const ZONE_LABEL: Record<Zone, string> = {
  over_cab: 'Over the cab',
  middle: 'In the middle',
  over_rear_axle: 'Over the back wheels',
}

export function LoadBay({ levelId, runIndex, carried }: Props) {
  const { go, reducedMotion } = useGame()
  const { profile } = usePlayer()
  const level = levelById(levelId)!
  const run = level.runs[runIndex]!

  const [placement, setPlacement] = useState<Record<string, Zone | null>>(() =>
    Object.fromEntries(run.crates.map((c) => [c.id, null])),
  )
  const [held, setHeld] = useState<string | null>(null)
  const snapshot = useRef<GripSnapshot>({ grip: 0, demand: 0, slipping: false })

  useEffect(() => {
    speak(`${level.spoken} ${run.brief}`)
  }, [level.spoken, run.brief])

  const rig: Rig = useMemo(
    () => ({
      crates: run.crates.map((c) => ({
        id: c.id,
        mass: c.mass,
        kind: c.kind,
        zone: placement[c.id] ?? null,
        secured: c.secured ?? true,
      })),
      tyres: profile.fitted.tyres,
      wheelWeights: profile.fitted.wheelWeights,
      liftAxleRaised: false,
      ballastKg: 0,
      mudOnCabKg: 0,
    }),
    [run.crates, placement, profile.fitted],
  )

  const worst = useMemo(() => hardestPoint(level, rig), [level, rig])
  snapshot.current = {
    grip: worst.budget.gripFraction,
    demand: worst.budget.demandFraction,
    slipping: worst.margin < 0,
  }

  const press = loadOnDrive(rig, worst.conditions, 0)
  const allPlaced = run.crates.every((c) => placement[c.id] !== null)

  const place = (crateId: string, zone: Zone) => {
    setPlacement((current) => ({ ...current, [crateId]: zone }))
    setHeld(null)
  }

  const takeBack = (crateId: string) => {
    setPlacement((current) => ({ ...current, [crateId]: null }))
    setHeld(crateId)
  }

  const cratesIn = (zone: Zone) => run.crates.filter((c) => placement[c.id] === zone)
  const cratesOut = run.crates.filter((c) => placement[c.id] === null)

  return (
    <div className="flex h-full w-full flex-col bg-paper p-3">
      {/* --- header ------------------------------------------------------- */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go({ k: 'yard' })}
          className="toy-sm rounded-2xl bg-card px-3 py-3 text-slate-deep"
          aria-label="Back to the yard"
        >
          <Icon name="back" className="h-6 w-6" />
        </button>
        <h1 className="signwritten-centred text-3xl text-haulage">{level.title}</h1>
        <SurfaceChip surface={worst.surface} />
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* --- the lorry ------------------------------------------------- */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Panel className="flex min-h-0 flex-1 flex-col p-3">
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
              {ZONES.map((zone) => (
                <DropZone
                  key={zone}
                  zone={zone}
                  label={ZONE_LABEL[zone]}
                  crates={cratesIn(zone).map((c) => ({ ...c, mass: c.mass }))}
                  armed={held !== null}
                  onDrop={() => held && place(held, zone)}
                  onPickUp={takeBack}
                />
              ))}
            </div>

            {/* The cab end, so the three zones read as places on a lorry. */}
            <div className="mt-2 flex items-end gap-1" aria-hidden>
              <div className="h-3 flex-1 rounded-l-lg border-[3px] border-slate-deep bg-slate-soft" />
              <div className="h-8 w-16 rounded-t-lg border-[3px] border-slate-deep bg-haulage" />
              <Wheel />
              <div className="h-3 w-6 border-y-[3px] border-slate-deep bg-slate-soft" />
              <Wheel />
              <Wheel big />
            </div>
          </Panel>

          {/* --- the yard --------------------------------------------------- */}
          <Panel tone="slate" className="p-3">
            <div className="signwritten mb-2 text-lg text-cream">Still in the yard</div>
            <div className="flex min-h-[76px] flex-wrap items-end gap-3">
              {cratesOut.length === 0 ? (
                <span className="signwritten-centred text-xl text-grit">All loaded</span>
              ) : (
                cratesOut.map((c) => (
                  <CrateChip
                    key={c.id}
                    id={c.id}
                    mass={c.mass}
                    kind={c.kind}
                    selected={held === c.id}
                    onSelect={() => setHeld(held === c.id ? null : c.id)}
                  />
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* --- the read-outs ---------------------------------------------- */}
        <div className="flex w-[236px] shrink-0 flex-col gap-2">
          <Panel className="p-3">
            <PressBar value={press / 6200} />
          </Panel>
          <Panel className="flex flex-1 items-center justify-center gap-2 p-3">
            <GripMeter
              snapshotRef={snapshot}
              reducedMotion={reducedMotion}
              compact
              className="h-full max-h-[200px] min-h-[120px] w-[76px]"
            />
            <p className="signwritten w-24 text-lg leading-tight text-slate-deep">
              {worst.margin >= 0 ? 'Should hold' : 'It will spin'}
            </p>
          </Panel>
          <BigButton
            tone="orange"
            icon="play"
            label="Ready"
            disabled={!allPlaced}
            say={allPlaced ? 'Off we go' : 'Load everything on first'}
            onClick={() =>
              go({
                k: 'predict',
                levelId,
                runIndex,
                carried,
                placement: placement as Record<string, Zone>,
              })
            }
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DropZone({
  zone,
  label,
  crates,
  armed,
  onDrop,
  onPickUp,
}: {
  zone: Zone
  label: string
  crates: { id: string; mass: number; kind: keyof typeof CRATE_COLOURS }[]
  armed: boolean
  onDrop: () => void
  onPickUp: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={onDrop}
      aria-label={`Put it ${label}`}
      className={`flex min-h-0 flex-col justify-end rounded-2xl border-4 border-dashed p-2 transition-colors ${
        armed ? 'border-hivis bg-hivis/15' : 'border-slate-deep/30 bg-paper/60'
      }`}
      data-zone={zone}
    >
      <div className="flex min-h-[70px] flex-wrap content-end items-end justify-center gap-2">
        {crates.map((c) => (
          <CrateChip
            key={c.id}
            id={c.id}
            mass={c.mass}
            kind={c.kind}
            onSelect={() => onPickUp(c.id)}
            placed
          />
        ))}
      </div>
      <span className="signwritten-centred mt-2 text-base text-slate-deep/80">{label}</span>
    </button>
  )
}

function CrateChip({
  id,
  mass,
  kind,
  selected,
  placed,
  onSelect,
}: {
  id: string
  mass: number
  kind: keyof typeof CRATE_COLOURS
  selected?: boolean
  placed?: boolean
  onSelect: () => void
}) {
  const colours = CRATE_COLOURS[kind]
  const size = 40 + Math.min(46, mass / 60)
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Crate ${id}`}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onSelect()
        }
      }}
      className={`toy-sm flex cursor-pointer flex-col items-center justify-center rounded-xl ${
        selected ? 'animate-wobble ring-4 ring-hivis' : ''
      } ${placed ? '' : ''}`}
      style={{
        width: size,
        height: size * 0.82,
        background: colours.fill,
        borderColor: '#1b222b',
      }}
    >
      <WeightPips mass={mass} />
    </span>
  )
}

function Wheel({ big }: { big?: boolean }) {
  return (
    <span
      className={`rounded-full border-[3px] border-slate-deep bg-slate-wet ${
        big ? 'h-9 w-9' : 'h-7 w-7'
      }`}
      aria-hidden
    />
  )
}
