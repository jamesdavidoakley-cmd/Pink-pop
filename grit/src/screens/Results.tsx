/**
 * What you earned. Only ever a list of things that went right — there is no
 * column for what went wrong, and nothing is ever deducted.
 */

import { useEffect } from 'react'
import { BigButton, Panel, XpBadge } from '../components/ui'
import { Icon } from '../components/Icon'
import { speak } from '../a11y/narration'
import { audio } from '../audio/engine'
import { levelById } from '../game/levels'
import { useGame, usePlayer } from '../state/store'
import type { XpAward } from '../game/xp'

interface Props {
  levelId: string
  awards: XpAward[]
  succeeded: boolean
  nextRun: number | null
}

export function Results({ levelId, awards, succeeded, nextRun }: Props) {
  const { go } = useGame()
  const { profile } = usePlayer()
  const level = levelById(levelId)!
  const total = awards.reduce((sum, a) => sum + a.amount, 0)

  useEffect(() => {
    speak(succeeded ? `Nice work. ${total} grip coins.` : 'Have another go whenever you like.', {
      force: true,
    })
    if (!succeeded) return
    let step = 0
    const timer = setInterval(() => {
      audio.chime(step++)
      if (step > Math.min(3, awards.length)) clearInterval(timer)
    }, 220)
    return () => clearInterval(timer)
  }, [succeeded, total, awards.length])

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-paper p-5">
      <h1 className="signwritten-centred text-5xl text-haulage">
        {succeeded ? 'Job done' : 'Good try'}
      </h1>

      <Panel className="animate-pop w-full max-w-xl p-5">
        <ul className="space-y-2">
          {awards.length === 0 ? (
            <li className="signwritten text-2xl text-slate-deep/60">Have another go — nothing lost.</li>
          ) : (
            awards.map((award, i) => (
              <li
                key={`${award.id}-${i}`}
                className="flex items-center justify-between gap-3 border-b-2 border-dashed border-slate-deep/15 pb-2 last:border-0"
              >
                <span className="flex items-center gap-2">
                  <Icon name="star" className="h-6 w-6 shrink-0 text-hivis" />
                  <span className="signwritten text-2xl text-slate-deep">{award.label}</span>
                </span>
                <span className="signwritten-centred text-2xl text-haulage">+{award.amount}</span>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t-4 border-slate-deep pt-3">
          <span className="signwritten text-3xl text-slate-deep">Grip coins</span>
          <XpBadge xp={profile.xp} />
        </div>
      </Panel>

      <div className="flex flex-wrap justify-center gap-3">
        {nextRun !== null ? (
          <BigButton
            tone="orange"
            icon="play"
            label="Next load"
            onClick={() => go({ k: 'loadbay', levelId, runIndex: nextRun, carried: awards })}
          />
        ) : null}
        <BigButton tone="green" icon="lorry" label="The yard" onClick={() => go({ k: 'yard' })} />
        <BigButton
          tone="slate"
          icon="replay"
          label="Again"
          onClick={() => go({ k: 'loadbay', levelId, runIndex: 0, carried: [] })}
        />
        {succeeded && !level.isBoss ? (
          <BigButton tone="cream" icon="shop" label="Shop" onClick={() => go({ k: 'shop' })} />
        ) : null}
      </div>
    </div>
  )
}
