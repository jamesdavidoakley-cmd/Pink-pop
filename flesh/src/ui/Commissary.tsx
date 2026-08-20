import { useCallback, useState } from 'react'
import { CommissaryCanvas, type Station } from '@/game/CommissaryScene'
import { HATS, type HatKind } from '@/art/rigs/Reagan'
import { LEVELS } from '@/levels'
import { audio } from '@/audio/engine'
import { UPGRADES, upgradePrice, upgradeTier, useGame, type UpgradeDef } from '@/state/store'
import { formatTime } from './Menus'

/**
 * The Commissary.
 *
 * Trans-Time's vending counter, the mission board with the Trail Boss Log, and
 * a jukebox nobody asked for. The log is the cheap part of this file and the
 * part that makes people replay: cumulative head delivered, head lost, and the
 * best drive on every level.
 */

export function Commissary() {
  const save = useGame((s) => s.save)
  const setScreen = useGame((s) => s.setScreen)
  const [nearStation, setNearStation] = useState<Station>(null)
  const [open, setOpen] = useState<Station>(null)

  const activate = useCallback((station: Exclude<Station, null>) => {
    audio.ensure()
    audio.resume()
    audio.ui(1.2)
    setOpen((current) => (current === station ? null : station))
  }, [])

  return (
    <div className="absolute inset-0 z-30 bg-[#141018]">
      <CommissaryCanvas hat={save.hat as HatKind} onStation={setNearStation} onActivate={activate} />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-4 top-4">
          <span className="masthead text-lg font-bold tracking-[0.18em]">TRANS-TIME COMMISSARY</span>
          <div className="mt-2 text-xs tracking-[0.22em] text-paper/60">
            W A S D TO WALK · E AT A STATION
          </div>
        </div>
        <div className="absolute right-4 top-4 text-right">
          <div className="text-[10px] tracking-[0.3em] text-paper/60">BALANCE</div>
          <div className="text-3xl font-bold leading-none text-corp-yellow">
            {save.credits.toLocaleString('en-GB')} FC
          </div>
        </div>
        {!open && nearStation && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 panel px-4 py-2 text-sm tracking-[0.2em]">
            PRESS E
          </div>
        )}
        <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
          <button className="btn" onClick={() => setScreen('levelSelect')}>
            Mission board
          </button>
          <button className="btn" onClick={() => setScreen('title')}>
            Title
          </button>
        </div>
      </div>

      {open === 'counter' && <VendingPanel onClose={() => setOpen(null)} />}
      {open === 'board' && <BoardPanel onClose={() => setOpen(null)} />}
      {open === 'jukebox' && <JukeboxPanel onClose={() => setOpen(null)} />}
    </div>
  )
}

/* ---------------------------------------------------------------- shell */

function Panel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/75 p-6">
      <div className="w-[min(52rem,94vw)] max-h-[86vh] overflow-y-auto scroll-thin corp-panel p-6">
        <div className="mb-4 flex items-baseline justify-between gap-3 border-b-2 border-ink pb-2">
          <div>
            <div className="text-2xl font-bold tracking-[0.14em] text-ink">{title}</div>
            {subtitle && <div className="text-xs text-ink/60">{subtitle}</div>}
          </div>
          <button className="btn border-ink text-ink hover:bg-ink hover:text-corp-white" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- vending */

function VendingPanel({ onClose }: { onClose: () => void }) {
  const save = useGame((s) => s.save)
  const buyUpgrade = useGame((s) => s.buyUpgrade)
  const buyHat = useGame((s) => s.buyHat)
  const setHat = useGame((s) => s.setHat)

  return (
    <Panel
      title="VENDING"
      subtitle={`${save.credits.toLocaleString('en-GB')} FC on account. Trans-Time does not extend credit.`}
      onClose={onClose}
    >
      <div className="grid gap-2">
        {UPGRADES.map((def) => (
          <UpgradeRow
            key={def.id}
            def={def}
            onBuy={() => {
              const ok = buyUpgrade(def.id)
              audio.ui(ok ? 1.5 : 0.6)
            }}
          />
        ))}
      </div>

      <div className="mt-6 border-t-2 border-ink pt-4">
        <div className="mb-1 text-sm font-bold tracking-[0.18em] text-ink">HEADWEAR</div>
        <p className="mb-3 text-xs text-ink/60">
          Purely cosmetic. The Controller has approved the expenditure without comment, which is
          unlike him.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {HATS.map((hat) => {
            const owned = save.hatsOwned.includes(hat.id)
            const worn = save.hat === hat.id
            return (
              <div key={hat.id} className="flex items-center justify-between gap-3 border-2 border-ink p-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink">{hat.name}</div>
                  <div className="truncate text-[11px] text-ink/60">{hat.blurb}</div>
                </div>
                {worn ? (
                  <span className="shrink-0 bg-corp-blue px-2 py-1 text-[10px] tracking-[0.18em] text-corp-white">
                    WORN
                  </span>
                ) : owned ? (
                  <button
                    className="btn shrink-0 border-ink py-1 text-xs text-ink hover:bg-ink hover:text-corp-white"
                    onClick={() => {
                      setHat(hat.id as HatKind)
                      audio.ui(1.3)
                    }}
                  >
                    Wear
                  </button>
                ) : (
                  <button
                    className="btn btn-corp shrink-0 py-1 text-xs"
                    disabled={save.credits < hat.price}
                    onClick={() => {
                      const ok = buyHat(hat.id as HatKind, hat.price)
                      audio.ui(ok ? 1.5 : 0.6)
                    }}
                  >
                    {hat.price} FC
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

function UpgradeRow({ def, onBuy }: { def: UpgradeDef; onBuy: () => void }) {
  const save = useGame((s) => s.save)
  const tier = upgradeTier(def, save.upgrades)
  const max = def.maxTier ?? 1
  const maxed = tier >= max
  const price = upgradePrice(def, save.upgrades)
  const affordable = save.credits >= price

  return (
    <div className="flex items-center justify-between gap-4 border-2 border-ink p-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold tracking-[0.1em] text-ink">{def.name}</span>
          {def.maxTier && (
            <span className="text-[10px] tracking-[0.18em] text-ink/50">
              {Array.from({ length: max })
                .map((_, i) => (i < tier ? '■' : '□'))
                .join(' ')}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] leading-snug text-ink/70">{def.blurb}</div>
      </div>
      {maxed ? (
        <span className="shrink-0 bg-ink px-3 py-1.5 text-[10px] tracking-[0.2em] text-corp-yellow">
          {def.maxTier ? 'MAXED' : 'OWNED'}
        </span>
      ) : (
        <button className="btn btn-corp shrink-0" disabled={!affordable} onClick={onBuy}>
          {price.toLocaleString('en-GB')} FC
        </button>
      )}
    </div>
  )
}

/* --------------------------------------------------------- mission board */

function BoardPanel({ onClose }: { onClose: () => void }) {
  const save = useGame((s) => s.save)
  const startLevel = useGame((s) => s.startLevel)
  const log = save.log

  return (
    <Panel title="MISSION BOARD" subtitle="Trail Boss Log — cumulative, and it does not forget." onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 border-2 border-ink p-3 sm:grid-cols-4">
        <LogFigure label="HEAD DELIVERED" value={log.totalHeadDelivered.toLocaleString('en-GB')} />
        <LogFigure label="HEAD LOST" value={log.totalHeadLost.toLocaleString('en-GB')} />
        <LogFigure label="DRIVES MADE" value={String(log.drivesCompleted)} />
        <LogFigure label="EARNED, ALL TIME" value={`${log.totalCreditsEarned.toLocaleString('en-GB')} FC`} />
      </div>

      {log.totalHeadDelivered + log.totalHeadLost > 0 && (
        <p className="mt-3 text-xs italic text-ink/60">
          {log.totalHeadLost === 0
            ? 'Not one head lost. The Controller has read the figure twice.'
            : `${log.totalHeadDelivered} delivered and ${log.totalHeadLost} lost. Filed as acceptable wastage.`}
        </p>
      )}

      <div className="mt-5">
        <div className="mb-2 text-sm font-bold tracking-[0.18em] text-ink">BEST RUN PER DRIVE</div>
        <div className="grid gap-1.5">
          {LEVELS.map((level, i) => {
            const rec = log.levels[level.id]
            const locked = i >= save.levelsUnlocked
            return (
              <div
                key={level.id}
                className={`flex flex-wrap items-baseline justify-between gap-2 border-2 border-ink p-2.5 ${
                  locked ? 'opacity-40' : ''
                }`}
              >
                <div className="min-w-0">
                  <span className="text-sm font-bold text-ink">
                    {String(i + 1).padStart(2, '0')} {level.name}
                  </span>
                  {rec && rec.attempts > 0 && (
                    <span className="ml-2 text-[11px] text-ink/50">{rec.attempts} attempts</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] tracking-[0.12em] text-ink/70">
                  {rec && rec.attempts > 0 ? (
                    <>
                      <span>{rec.bestHead}/{level.herd.count} HEAD</span>
                      <span>{rec.bestCredits.toLocaleString('en-GB')} FC</span>
                      <span>{rec.bestTime > 0 ? formatTime(rec.bestTime) : '—'}</span>
                    </>
                  ) : (
                    <span className="text-ink/40">{locked ? 'LOCKED' : 'NOT RUN'}</span>
                  )}
                  {!locked && (
                    <button
                      className="btn btn-corp py-1 text-[11px]"
                      onClick={() => {
                        audio.ui(1.3)
                        startLevel(i)
                      }}
                    >
                      Ride
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

function LogFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] text-ink/50">{label}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
    </div>
  )
}

/* -------------------------------------------------------------- jukebox */

const TRACKS: { name: string; blurb: string; play: () => void }[] = [
  {
    name: 'THE LONG DRIVE',
    blurb: 'Guitar, reverb, and about four notes. It is the only track anybody plays.',
    play: () => audio.westernSting(),
  },
  {
    name: 'HERD AT REST',
    blurb: 'A recording of stock lowing. Head office believes it is calming.',
    play: () => {
      audio.lowing(0.9)
      window.setTimeout(() => audio.lowing(1.1), 620)
      window.setTimeout(() => audio.lowing(0.8), 1400)
    },
  },
  {
    name: 'CORPORATE ANNOUNCEMENT TONE',
    blurb: 'Two notes. Trans-Time has never explained why it is on the jukebox.',
    play: () => audio.corporate(),
  },
  {
    name: 'SOMETHING IN THE TREELINE',
    blurb: 'The Controller has asked twice for this one to be removed.',
    play: () => audio.roar(true),
  },
]

function JukeboxPanel({ onClose }: { onClose: () => void }) {
  const save = useGame((s) => s.save)
  const toggleMute = useGame((s) => s.toggleMute)

  return (
    <Panel title="JUKEBOX" subtitle="Property of the Trans-Time Corporation. Do not lean on it." onClose={onClose}>
      <div className="grid gap-2">
        {TRACKS.map((t) => (
          <button
            key={t.name}
            className="border-2 border-ink p-3 text-left hover:bg-ink/10"
            onClick={() => {
              audio.ensure()
              audio.resume()
              t.play()
            }}
          >
            <div className="text-sm font-bold tracking-[0.12em] text-ink">{t.name}</div>
            <div className="mt-0.5 text-[11px] text-ink/60">{t.blurb}</div>
          </button>
        ))}
      </div>
      <button
        className="btn btn-corp mt-4"
        onClick={() => {
          const muted = toggleMute()
          audio.setMuted(muted)
        }}
      >
        {save.muted ? 'Sound is off' : 'Sound is on'}
      </button>
    </Panel>
  )
}
