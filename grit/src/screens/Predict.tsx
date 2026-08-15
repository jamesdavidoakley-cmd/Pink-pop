/**
 * "Will it grip?"
 *
 * One tap, no penalty for being wrong, XP for being right. This screen exists
 * because committing to a guess before you see the answer is where the learning
 * actually happens — so it cannot be skipped on ground the player has not met.
 */

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { BigButton, Panel, StickyPips, SurfaceChip } from '../components/ui'
import { speak } from '../a11y/narration'
import { audio } from '../audio/engine'
import { hardestPoint } from '../game/analysis'
import { levelById } from '../game/levels'
import { useGame, usePlayer } from '../state/store'
import { surfacesOf } from '../physics/track'
import type { Rig } from '../physics/model'
import type { Zone } from '../physics/constants'
import { SURFACE_NAME } from '../theme'
import type { XpAward } from '../game/xp'

interface Props {
  levelId: string
  runIndex: number
  placement: Record<string, Zone>
  carried: XpAward[]
}

export function Predict({ levelId, runIndex, placement, carried }: Props) {
  const { go } = useGame()
  const { profile } = usePlayer()
  const level = levelById(levelId)!
  const run = level.runs[runIndex]!

  const rig: Rig = useMemo(
    () => ({
      crates: run.crates.map((c) => ({
        id: c.id,
        mass: c.mass,
        kind: c.kind,
        zone: placement[c.id] ?? 'middle',
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
  const truth = worst.margin >= 0

  // The card cannot be waved away on ground they have not driven on yet.
  const unmetSurfaces = surfacesOf(level.track).filter((s) => !profile.seenSurfaces.includes(s))
  const mustAnswer = unmetSurfaces.length > 0

  const [answer, setAnswer] = useState<boolean | null>(null)

  useEffect(() => {
    speak('Will it grip?')
  }, [])

  const choose = (guess: boolean) => {
    if (answer !== null) return
    setAnswer(guess)
    const right = guess === truth
    audio.start()
    if (right) audio.chime(1)
    else audio.clunk()
    speak(right ? 'Good call.' : truth ? 'It will actually grip. Have a go.' : 'It is going to spin. Have a go anyway.', {
      force: true,
    })
  }

  const onwards = () =>
    go({
      k: 'drive',
      levelId,
      runIndex,
      carried,
      placement,
      predictionCorrect: answer === null ? null : answer === truth,
    })

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-paper p-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {surfacesOf(level.track).map((s) => (
          <SurfaceChip key={s} surface={s} />
        ))}
      </div>

      <Panel className="animate-pop w-full max-w-2xl p-6 text-center">
        <h1 className="signwritten-centred mb-1 text-5xl text-haulage">Will it grip?</h1>
        <p className="mb-5 text-lg text-slate-deep/70">
          {SURFACE_NAME[worst.surface]}
          {worst.conditions.slope > 0.03 ? ', going up' : ''}
          {worst.conditions.bendRadius ? ', round a bend' : ''}
        </p>

        <div className="flex items-center justify-center gap-6">
          <ThumbButton
            up
            chosen={answer === true}
            dimmed={answer !== null && answer !== true}
            onClick={() => choose(true)}
          />
          <ThumbButton
            chosen={answer === false}
            dimmed={answer !== null && answer !== false}
            onClick={() => choose(false)}
          />
        </div>

        {answer !== null ? (
          <div className="animate-pop mt-5">
            <p className="signwritten-centred text-3xl text-slate-deep">
              {answer === truth ? 'Spot on' : 'Good guess'}
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="text-lg text-slate-deep/70">How sticky it is</span>
              <StickyPips surface={worst.surface} />
            </div>
          </div>
        ) : null}
      </Panel>

      <div className="flex gap-3">
        <BigButton
          tone="orange"
          icon="play"
          label="Drive"
          disabled={mustAnswer && answer === null}
          say={mustAnswer && answer === null ? 'Have a guess first' : 'Off we go'}
          onClick={onwards}
        />
        {!mustAnswer && answer === null ? (
          <BigButton tone="slate" label="Skip" onClick={onwards} />
        ) : null}
      </div>
    </div>
  )
}

function ThumbButton({
  up,
  chosen,
  dimmed,
  onClick,
}: {
  up?: boolean
  chosen: boolean
  dimmed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={up ? 'Yes, it will grip' : 'No, it will spin'}
      className={`toy toy-press flex h-32 w-36 items-center justify-center rounded-3xl transition-all ${
        up ? 'bg-haulage text-cream' : 'bg-hivis text-slate-deep'
      } ${chosen ? 'scale-105 ring-8 ring-slate-deep/25' : ''} ${dimmed ? 'opacity-35' : ''}`}
    >
      <Icon name={up ? 'thumb-up' : 'thumb-down'} className="h-20 w-20" />
    </button>
  )
}
