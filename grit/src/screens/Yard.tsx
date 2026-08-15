/**
 * The yard: pick a job. Locked levels show a padlock, finished ones show what
 * you managed on them. There is no score to beat and nothing expires.
 */

import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { XpBadge } from '../components/ui'
import { speak } from '../a11y/narration'
import { audio } from '../audio/engine'
import { FREE_PLAY, LEVELS, freePlayUnlocked, isUnlocked, type Level } from '../game/levels'
import { itemById } from '../game/shop'
import { useGame, usePlayer } from '../state/store'
import type { Fitted } from '../state/save'
import { surfacesOf } from '../physics/track'
import { CHAINS_FORBIDDEN } from '../physics/constants'
import { SURFACE_COLOURS } from '../theme'

export function Yard() {
  const { go, signOut } = useGame()
  const { profile, update } = usePlayer()

  const completed = new Set(Object.keys(profile.levels).filter((id) => profile.levels[id]?.completed))

  useEffect(() => {
    speak('Pick a job.')
  }, [])

  const start = (level: Level) => {
    audio.start()

    // Kit the level hands over on arrival.
    if (level.grants) {
      const item = itemById(level.grants)
      if (item && !profile.owned.includes(item.id)) {
        update((p) => ({
          ...p,
          owned: [...p.owned, item.id],
          fitted: fitGranted(p.fitted, item.id),
        }))
        speak(`${item.spoken}`, { force: true })
      }
    }

    // Chains simply will not go on a tarmac road.
    const surfaces = surfacesOf(level.track)
    if (profile.fitted.tyres === 'chains' && surfaces.some((s) => CHAINS_FORBIDDEN.includes(s))) {
      update((p) => ({ ...p, fitted: { ...p.fitted, tyres: 'road' } }))
      speak('Chains will not go on this road. Normal tyres back on.', { force: true })
    }

    go({ k: 'loadbay', levelId: level.id, runIndex: 0, carried: [] })
  }

  return (
    <div className="flex h-full w-full flex-col bg-paper">
      <header className="flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={signOut}
          className="toy-sm flex items-center gap-2 rounded-2xl bg-card px-3 py-2 text-slate-deep"
        >
          <Icon name="back" className="h-5 w-5" />
          <span className="signwritten-centred text-xl">{profile.name}</span>
        </button>

        <h1 className="signwritten-centred text-4xl text-haulage">The yard</h1>

        <div className="flex items-center gap-2">
          <XpBadge xp={profile.xp} />
          <button
            type="button"
            onClick={() => go({ k: 'shop' })}
            className="toy-sm rounded-2xl bg-hivis px-3 py-3 text-slate-deep"
            aria-label="The shop"
          >
            <Icon name="shop" className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => go({ k: 'grownup' })}
            className="toy-sm rounded-2xl bg-card px-3 py-3 text-slate-deep"
            aria-label="Grown-ups"
          >
            <Icon name="cog" className="h-7 w-7" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">
          {LEVELS.map((level) => (
            <LevelTile
              key={level.id}
              level={level}
              unlocked={isUnlocked(level, completed)}
              record={profile.levels[level.id]}
              onStart={() => start(level)}
            />
          ))}
          <LevelTile
            level={FREE_PLAY}
            unlocked={freePlayUnlocked(completed)}
            record={profile.levels[FREE_PLAY.id]}
            onStart={() => go({ k: 'loadbay', levelId: FREE_PLAY.id, runIndex: 0, carried: [] })}
            isYard
          />
        </div>
      </div>
    </div>
  )
}

function LevelTile({
  level,
  unlocked,
  record,
  onStart,
  isYard,
}: {
  level: Level
  unlocked: boolean
  record?: { completed: boolean; cleanRun: boolean; cargoIntact: boolean }
  onStart: () => void
  isYard?: boolean
}) {
  const surfaces = surfacesOf(level.track)

  return (
    <button
      type="button"
      disabled={!unlocked}
      onClick={() => {
        if (!unlocked) {
          speak('Finish the one before this first.', { force: true })
          return
        }
        speak(level.spoken, { force: true })
        onStart()
      }}
      className={`toy toy-press relative flex flex-col items-start gap-2 rounded-2xl p-3 text-left ${
        !unlocked
          ? 'bg-grit-dark/50 text-slate-deep/50'
          : level.isBoss
            ? 'bg-slate-wet text-cream'
            : isYard
              ? 'bg-haulage text-cream'
              : 'bg-card text-slate-deep'
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="signwritten-centred text-2xl leading-none">
          {isYard ? '' : level.number}
        </span>
        {!unlocked ? (
          <Icon name="lock" className="h-6 w-6" />
        ) : record?.completed ? (
          <Icon name="tick" className="h-6 w-6 text-hivis" />
        ) : null}
      </div>

      <span className="signwritten text-xl leading-tight">{level.title}</span>

      {/* The ground you will be on, as a row of painted swatches. */}
      <div className="flex gap-1" aria-hidden>
        {surfaces.slice(0, 6).map((s) => (
          <span
            key={s}
            className="h-4 w-4 rounded border-2 border-slate-deep"
            style={{ background: SURFACE_COLOURS[s].top }}
          />
        ))}
      </div>

      {record?.completed ? (
        <div className="flex gap-1" aria-hidden>
          {record.cleanRun ? <Icon name="star" className="h-5 w-5 text-hivis" /> : null}
          {record.cargoIntact ? <Icon name="crate" className="h-5 w-5 text-haulage" /> : null}
        </div>
      ) : null}

      {level.isBoss ? (
        <span className="signwritten-centred absolute right-2 top-8 text-sm text-hivis">BOSS</span>
      ) : null}
    </button>
  )
}

/** Kit arrives already bolted on, so the level it was given for can use it. */
export function fitGranted(fitted: Fitted, id: string): Fitted {
  switch (id) {
    case 'knobbly':
      return { ...fitted, tyres: 'knobbly' }
    case 'chains':
      return { ...fitted, tyres: 'chains' }
    case 'sand':
      return { ...fitted, sandHopper: true }
    case 'liftaxle':
      return { ...fitted, liftAxle: true }
    case 'boards':
      return { ...fitted, boards: true }
    case 'ballast':
      return { ...fitted, ballastTank: true }
    case 'weights':
      return { ...fitted, wheelWeights: true }
    default:
      return fitted
  }
}
