/**
 * A bench for the grip meter. Not reachable from the game; open with ?lab=meter.
 * It exists so the signature component can be tuned on its own before anything
 * is built around it.
 */

import { useRef, useState } from 'react'
import { GripMeter, type GripSnapshot } from './components/GripMeter'

export function MeterLab() {
  const [grip, setGrip] = useState(0.7)
  const [demand, setDemand] = useState(0.35)
  const snap = useRef<GripSnapshot>({ grip: 0.7, demand: 0.35, slipping: false })
  snap.current = { grip, demand, slipping: demand > grip }

  const frozen = [
    { label: 'Dry road, loaded right', grip: 0.82, demand: 0.55 },
    { label: 'Asking for everything', grip: 0.82, demand: 0.8 },
    { label: 'Gravel, too much thumb', grip: 0.42, demand: 0.74 },
    { label: 'Ice, empty bed', grip: 0.11, demand: 0.62 },
  ]

  return (
    <div className="h-full w-full overflow-auto bg-slate-deep p-6 text-cream">
      <h1 className="signwritten-centred mb-4 text-3xl text-hivis">Grip meter bench</h1>

      <div className="flex flex-wrap items-start gap-8">
        <div>
          <GripMeter snapshotRef={snap} className="h-[340px] w-[150px]" />
          <div className="mt-4 w-[240px] space-y-3 text-sm">
            <label className="block">
              grit line {grip.toFixed(2)}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={grip}
                onChange={(e) => setGrip(Number(e.target.value))}
                className="w-full"
              />
            </label>
            <label className="block">
              demand {demand.toFixed(2)}
              <input
                type="range"
                min={0}
                max={1.18}
                step={0.01}
                value={demand}
                onChange={(e) => setDemand(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
        </div>

        {frozen.map((f) => (
          <FrozenMeter key={f.label} {...f} />
        ))}

        <div>
          <p className="mb-2 text-xs opacity-70">compact (load bay)</p>
          <FrozenMeter label="compact" grip={0.62} demand={0.4} compact />
        </div>
      </div>
    </div>
  )
}

function FrozenMeter({
  label,
  grip,
  demand,
  compact,
}: {
  label: string
  grip: number
  demand: number
  compact?: boolean
}) {
  const ref = useRef<GripSnapshot>({ grip, demand, slipping: demand > grip })
  return (
    <div className="text-center">
      <GripMeter
        snapshotRef={ref}
        compact={compact}
        className={compact ? "h-[160px] w-[70px]" : "h-[340px] w-[150px]"}
      />
      <p className="mt-2 max-w-[128px] text-xs leading-tight opacity-80">{label}</p>
    </div>
  )
}
