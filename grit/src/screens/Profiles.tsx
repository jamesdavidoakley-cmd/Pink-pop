/**
 * Two drivers, two separate saves, so a sibling never treads on the other's
 * progress. No sign-up, no account, nothing typed unless a grown-up wants to.
 */

import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { Panel } from '../components/ui'
import { speak } from '../a11y/narration'
import { audio } from '../audio/engine'
import { useGame } from '../state/store'
import { LEVELS } from '../game/levels'

export function Profiles() {
  const { save, chooseProfile } = useGame()

  useEffect(() => {
    speak('Who is driving today?')
  }, [])

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-paper p-6">
      <div className="text-center">
        <h1 className="signwritten-centred text-7xl leading-none text-haulage">GRIT</h1>
        <p className="signwritten-centred mt-1 text-2xl text-hivis">Haulage</p>
      </div>

      <p className="signwritten-centred text-2xl text-slate-deep">Who is driving?</p>

      <div className="flex flex-wrap justify-center gap-5">
        {save.profiles.map((profile) => {
          const done = Object.values(profile.levels).filter((l) => l.completed).length
          return (
            <button
              key={profile.slot}
              type="button"
              onClick={() => {
                audio.start()
                audio.tap()
                chooseProfile(profile.slot)
              }}
              className="toy toy-press w-56 rounded-3xl bg-card p-5 text-slate-deep"
            >
              <div
                className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-slate-deep"
                style={{ background: profile.colour }}
              >
                <Icon name="lorry" className="h-14 w-14 text-cream" />
              </div>
              <p className="signwritten-centred text-3xl leading-none">{profile.name}</p>
              <p className="mt-2 text-sm text-slate-deep/70">
                {profile.created ? `${done} of ${LEVELS.length} jobs done` : 'New driver'}
              </p>
            </button>
          )
        })}
      </div>

      <Panel className="max-w-lg p-4 text-center text-sm text-slate-deep/70">
        Everything stays on this tablet. No adverts, nothing to buy, no links out and nobody to talk
        to. Turn it sideways and hold the green pedal.
      </Panel>
    </div>
  )
}
