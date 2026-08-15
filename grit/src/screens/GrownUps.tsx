/**
 * The grown-up panel, behind a gate a six year old will not idly get through.
 *
 * It reports what the child has shown they understand — every entry is
 * evidenced by something they did at the controls, never by a question they
 * answered. This is also the only place the real numbers exist.
 */

import { useState } from 'react'
import { Icon } from '../components/Icon'
import { BigButton, Panel } from '../components/ui'
import { CONCEPTS, type ConceptId } from '../state/save'
import { useGame, usePlayer } from '../state/store'
import { LEVELS } from '../game/levels'
import { MU_SURFACE, PLACEMENT_FACTOR } from '../physics/constants'
import { SURFACE_NAME } from '../theme'

const GATE_WORDS = ['four', 'one', 'nine', 'two']
const GATE_ANSWER = '4192'

export function GrownUps() {
  const { go } = useGame()
  const { profile, update } = usePlayer()
  const { resetProfile } = useGame()
  const [entry, setEntry] = useState('')
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  if (!open) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-paper p-6">
        <Panel className="w-full max-w-md p-6 text-center">
          <h1 className="signwritten-centred mb-2 text-3xl text-haulage">Grown-ups</h1>
          <p className="mb-4 text-slate-deep/75">
            Type the number: <strong>{GATE_WORDS.join(' — ')}</strong>
          </p>
          <input
            inputMode="numeric"
            value={entry}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '').slice(0, 4)
              setEntry(next)
              if (next === GATE_ANSWER) setOpen(true)
            }}
            className="toy-sm w-40 rounded-xl bg-card px-4 py-3 text-center text-3xl tracking-[0.4em] text-slate-deep"
            aria-label="Four digit code"
          />
        </Panel>
        <BigButton tone="green" icon="back" label="Back" onClick={() => go({ k: 'yard' })} />
      </div>
    )
  }

  const completed = Object.values(profile.levels).filter((l) => l.completed).length
  const setSetting = (patch: Partial<typeof profile.settings>) =>
    update((p) => ({ ...p, settings: { ...p.settings, ...patch } }))

  return (
    <div className="h-full w-full overflow-y-auto bg-paper p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="signwritten-centred text-4xl text-haulage">Grown-ups</h1>
        <BigButton tone="green" icon="back" label="Back" onClick={() => go({ k: 'yard' })} />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="signwritten mb-1 text-2xl text-slate-deep">What {profile.name} has shown</h2>
          <p className="mb-4 text-sm text-slate-deep/70">
            Each of these is ticked by something they did at the controls, not by anything they were
            asked. There is no quiz in this game.
          </p>
          <ul className="space-y-3">
            {CONCEPTS.map((concept) => (
              <MasteryRow key={concept.id} concept={concept} count={profile.mastery[concept.id] ?? 0} />
            ))}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <h2 className="signwritten mb-3 text-2xl text-slate-deep">Progress</h2>
            <dl className="grid grid-cols-2 gap-3 text-slate-deep">
              <Stat label="Jobs finished" value={`${completed} of ${LEVELS.length}`} />
              <Stat label="Grip coins" value={`${profile.xp}`} />
              <Stat
                label="Guesses right"
                value={
                  profile.predictions.total === 0
                    ? '—'
                    : `${profile.predictions.correct} of ${profile.predictions.total}`
                }
              />
              <Stat label="Grounds met" value={`${profile.seenSurfaces.length} of 7`} />
            </dl>
          </Panel>

          <Panel className="p-5">
            <h2 className="signwritten mb-3 text-2xl text-slate-deep">Settings</h2>
            <div className="space-y-2">
              <SettingRow
                label="Show the numbers"
                hint="Overlays the live values and the formula on the meter. For an older sibling."
                on={profile.settings.showNumbers}
                onToggle={() => setSetting({ showNumbers: !profile.settings.showNumbers })}
              />
              <SettingRow
                label="Spoken instructions"
                on={profile.settings.narration}
                onToggle={() => setSetting({ narration: !profile.settings.narration })}
              />
              <SettingRow
                label="Sound"
                on={profile.settings.sound}
                onToggle={() => setSetting({ sound: !profile.settings.sound })}
              />
              <SettingRow
                label="Reduce motion"
                hint="Stops the spray, the smear and the rocking cab."
                on={profile.settings.reducedMotion}
                onToggle={() => setSetting({ reducedMotion: !profile.settings.reducedMotion })}
              />
            </div>
          </Panel>

          {profile.settings.showNumbers ? <TheNumbers /> : null}

          <Panel className="p-5">
            <h2 className="signwritten mb-2 text-2xl text-slate-deep">This profile</h2>
            <label className="mb-3 block">
              <span className="text-sm text-slate-deep/70">Name</span>
              <input
                value={profile.name}
                maxLength={14}
                onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
                className="toy-sm mt-1 w-full rounded-xl bg-card px-3 py-2 text-xl text-slate-deep"
              />
            </label>
            {confirmReset ? (
              <div className="flex gap-2">
                <BigButton
                  tone="orange"
                  label="Yes, wipe it"
                  onClick={() => {
                    resetProfile(profile.slot)
                    setConfirmReset(false)
                    go({ k: 'profiles' })
                  }}
                />
                <BigButton tone="slate" label="No" onClick={() => setConfirmReset(false)} />
              </div>
            ) : (
              <BigButton tone="slate" label="Start this profile again" onClick={() => setConfirmReset(true)} />
            )}
          </Panel>

          <Panel className="p-5 text-sm leading-relaxed text-slate-deep/80">
            <h2 className="signwritten mb-2 text-2xl text-slate-deep">About</h2>
            <p className="mb-2">
              Everything is stored on this device only. No accounts, no adverts, no purchases, no
              links out, and nothing is sent anywhere. It works with the network switched off.
            </p>
            <p>
              The child-facing words are <em>grippiness</em>, <em>press</em>, <em>grip coins</em> and{' '}
              <em>wheelspin</em>. The adult words for the same ideas are deliberately absent from
              every screen they see.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function MasteryRow({
  concept,
  count,
}: {
  concept: { id: ConceptId; grownUpLabel: string; evidence: string }
  count: number
}) {
  const level = count === 0 ? 0 : count < 2 ? 1 : count < 5 ? 2 : 3
  const labels = ['Not yet seen', 'Emerging', 'Getting it', 'Solid']
  return (
    <li className="border-b-2 border-dashed border-slate-deep/15 pb-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="signwritten text-xl text-slate-deep">{concept.grownUpLabel}</span>
        <span className="flex items-center gap-1" aria-label={labels[level]}>
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full border-2 border-slate-deep ${
                i <= level ? 'bg-haulage' : 'bg-transparent'
              }`}
            />
          ))}
        </span>
      </div>
      <p className="text-sm text-slate-deep/70">{concept.evidence}</p>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="toy-sm rounded-xl bg-card px-3 py-2">
      <dt className="text-xs text-slate-deep/60">{label}</dt>
      <dd className="signwritten-centred text-2xl">{value}</dd>
    </div>
  )
}

function SettingRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="toy-sm flex w-full items-center justify-between gap-3 rounded-xl bg-card px-3 py-3 text-left"
    >
      <span>
        <span className="signwritten text-xl text-slate-deep">{label}</span>
        {hint ? <span className="block text-xs text-slate-deep/65">{hint}</span> : null}
      </span>
      <span
        className={`flex h-8 w-14 shrink-0 items-center rounded-full border-[3px] border-slate-deep px-1 ${
          on ? 'justify-end bg-haulage' : 'justify-start bg-grit-dark'
        }`}
      >
        <span className="h-5 w-5 rounded-full border-2 border-slate-deep bg-cream" />
      </span>
    </button>
  )
}

/** The actual model, written out, for anyone who wants to see it. */
function TheNumbers() {
  return (
    <Panel tone="slate" className="p-5 text-cream">
      <h2 className="signwritten mb-2 flex items-center gap-2 text-2xl">
        <Icon name="cog" className="h-6 w-6" />
        The model
      </h2>
      <pre className="overflow-x-auto rounded-xl bg-slate-deep p-3 text-xs leading-relaxed">
        {`grip  = grippiness × press × g
press = rear_static
      + Σ crate.mass × place[zone]
      + accel × k  (it squats)
      + slope × k  (the hill leans it back)
      + wheel weights, lift axle, ballast
demand = mass × accel + mass × g × sin(slope)
       ⊕ mass × v² / bend radius
if demand > grip → the wheel spins,
and grippiness drops to 0.6 of itself,
so easing off is the only way back.`}
      </pre>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {Object.entries(MU_SURFACE).map(([id, mu]) => (
          <div key={id} className="flex justify-between">
            <span>{SURFACE_NAME[id as keyof typeof SURFACE_NAME]}</span>
            <span className="tabular-nums opacity-80">{mu.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {Object.entries(PLACEMENT_FACTOR).map(([zone, factor]) => (
          <div key={zone} className="rounded-lg bg-slate-deep px-2 py-1 text-center">
            <div className="text-xs opacity-70">{zone.replace(/_/g, ' ')}</div>
            <div className="tabular-nums">{factor.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
