import { useEffect, useMemo, useState } from 'react'
import { DIFFICULTIES, DIFFICULTY_ORDER } from '@/state/difficulty'
import { LEVELS, LOADING_TIPS } from '@/levels'
import { CONTROL_HELP } from '@/core/input'
import { audio } from '@/audio/engine'
import { useGame } from '@/state/store'

/**
 * Menus.
 *
 * Trans-Time's house style: clean white panels, cobalt and hazard yellow, all
 * of it looking faintly wrong pasted over sixty-five million years of badlands.
 * The corporation is cheerful about everything, including the body count.
 */

/* ------------------------------------------------------------------ title */

export function TitleScreen() {
  const save = useGame((s) => s.save)
  const setDifficulty = useGame((s) => s.setDifficulty)
  const setScreen = useGame((s) => s.setScreen)
  const toggleMute = useGame((s) => s.toggleMute)

  return (
    <Backdrop>
      <div className="w-[min(56rem,92vw)]">
        <div className="mb-8 text-center">
          <h1 className="masthead text-6xl font-bold tracking-[0.18em] sm:text-8xl">FLESH</h1>
          <p className="mt-4 text-lg tracking-[0.5em] text-paper/85 sm:text-2xl">THE LONG DRIVE</p>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-paper/65">
            Sixty-five million years back, the Trans-Time Corporation farms dinosaurs and beams the
            meat forward. You are Earl Reagan, trail boss. Get the herd to Base 3.
          </p>
        </div>

        <div className="corp-panel p-5">
          <div className="mb-3 text-xs tracking-[0.3em] text-ink/60">SELECT DRIVE CONDITIONS</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {DIFFICULTY_ORDER.map((id) => {
              const d = DIFFICULTIES[id]
              const active = save.difficulty === id
              return (
                <button
                  key={id}
                  onClick={() => {
                    audio.ui(active ? 1 : 1.2)
                    setDifficulty(id)
                  }}
                  className={`border-2 border-ink p-3 text-left transition-transform ${
                    active ? 'bg-corp-blue text-corp-white' : 'bg-transparent text-ink hover:bg-ink/10'
                  }`}
                >
                  <div className="text-sm font-bold tracking-[0.16em]">{d.name}</div>
                  <div className={`mt-1 text-[11px] leading-snug ${active ? 'text-corp-white/85' : 'text-ink/70'}`}>
                    {d.blurb}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            className="btn btn-corp text-lg"
            onClick={() => {
              audio.ensure()
              audio.resume()
              audio.setMuted(save.muted)
              audio.ui(1.4)
              setScreen('levelSelect')
            }}
          >
            Ride out
          </button>
          <button className="btn" onClick={() => setScreen('commissary')}>
            Commissary
          </button>
          <button className="btn" onClick={() => setScreen('log')}>
            Trail Boss Log
          </button>
          <button
            className="btn"
            onClick={() => {
              const muted = toggleMute()
              audio.setMuted(muted)
            }}
          >
            {save.muted ? 'Sound: off' : 'Sound: on'}
          </button>
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-paper/40">
          After Pat Mills' <em>Flesh</em>, 2000 AD Prog 1, 1977. Flesh, Earl Reagan, Trans-Time and
          Old One Eye are Rebellion's property. This is a personal build, and nothing in it is for
          sale.
        </p>
      </div>
    </Backdrop>
  )
}

/* ----------------------------------------------------------- level select */

export function LevelSelect() {
  const save = useGame((s) => s.save)
  const startLevel = useGame((s) => s.startLevel)
  const setScreen = useGame((s) => s.setScreen)

  return (
    <Backdrop>
      <div className="w-[min(62rem,94vw)]">
        <Header title="MISSION BOARD" subtitle={`${save.credits.toLocaleString('en-GB')} FLESH CREDITS`} />

        <div className="grid gap-3 sm:grid-cols-2">
          {LEVELS.map((level, i) => {
            const locked = i >= save.levelsUnlocked
            const record = save.log.levels[level.id]
            return (
              <button
                key={level.id}
                disabled={locked}
                onClick={() => {
                  audio.ensure()
                  audio.resume()
                  audio.ui(1.2)
                  startLevel(i)
                }}
                className={`panel p-4 text-left ${
                  locked ? 'cursor-not-allowed opacity-40' : 'hover:border-corp-yellow'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold tracking-[0.16em] text-corp-yellow">
                    {String(i + 1).padStart(2, '0')} — {level.name}
                  </span>
                  {record?.completed && <span className="text-[10px] tracking-[0.2em] text-graze">CLEARED</span>}
                </div>
                <div className="mt-1 text-xs text-paper/70">{level.subtitle}</div>
                <div className="mt-2 text-[11px] leading-snug text-paper/50">{level.teaches}</div>
                {record && record.attempts > 0 && (
                  <div className="mt-2 flex gap-4 text-[10px] tracking-[0.14em] text-paper/60">
                    <span>BEST {record.bestHead} HEAD</span>
                    <span>{record.bestCredits.toLocaleString('en-GB')} FC</span>
                    {record.bestTime > 0 && <span>{formatTime(record.bestTime)}</span>}
                  </div>
                )}
                {locked && <div className="mt-2 text-[10px] tracking-[0.2em]">CLEAR THE PREVIOUS DRIVE</div>}
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex justify-center gap-3">
          <button className="btn" onClick={() => setScreen('title')}>
            Back
          </button>
          <button className="btn" onClick={() => setScreen('commissary')}>
            Commissary
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

/* ---------------------------------------------------------------- loading */

/**
 * The gate between the menu and the drive. It exists for a practical reason —
 * pointer lock and audio both need a user gesture — and is dressed as a
 * dispatch order, which is a better use of that moment than a spinner.
 */
export function BriefingScreen({ onBegin }: { onBegin: () => void }) {
  const levelIndex = useGame((s) => s.levelIndex)
  const abandon = useGame((s) => s.abandonRun)
  const level = LEVELS[levelIndex]!
  const tip = useMemo(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]!, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') onBegin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBegin])

  return (
    <Backdrop>
      <div className="w-[min(46rem,92vw)]">
        <div className="corp-panel p-6">
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
            <span className="text-xs tracking-[0.3em] text-ink/60">TRANS-TIME CORPORATION</span>
            <span className="text-xs tracking-[0.2em] text-ink/60">DISPATCH {String(levelIndex + 1).padStart(3, '0')}</span>
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-[0.1em] text-ink">{level.name}</h2>
          <p className="mt-1 text-sm text-ink/70">{level.subtitle}</p>
          <p className="mt-4 text-sm leading-relaxed text-ink">{level.brief}</p>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t-2 border-ink pt-4 text-center">
            <Stat label="HEAD" value={String(level.herd.count)} />
            <Stat label="MARKERS" value={String(level.terrain.route.length - 1)} />
            <Stat label="PAR" value={formatTime(level.par)} />
          </div>
        </div>

        <p className="mt-5 text-center text-sm italic text-paper/70">“{tip}”</p>

        <div className="mt-6 flex justify-center gap-3">
          <button className="btn btn-corp text-lg" onClick={onBegin}>
            Move them out
          </button>
          <button className="btn" onClick={abandon}>
            Back to the board
          </button>
        </div>
        <p className="mt-3 text-center text-[10px] tracking-[0.2em] text-paper/40">
          CLICK TO LOCK THE MOUSE — ESC RELEASES IT
        </p>
      </div>
    </Backdrop>
  )
}

/* ------------------------------------------------------------------ pause */

export function PauseScreen({ onResume }: { onResume: () => void }) {
  const abandon = useGame((s) => s.abandonRun)
  const save = useGame((s) => s.save)
  const toggleMute = useGame((s) => s.toggleMute)

  return (
    <Backdrop>
      <div className="w-[min(40rem,92vw)]">
        <Header title="HOLDING" subtitle="The herd is not." />
        <div className="panel p-5">
          <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {CONTROL_HELP.map((c) => (
              <div key={c.keys} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-bold tracking-[0.1em] text-corp-yellow">{c.keys}</span>
                <span className="text-paper/70">{c.what}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button className="btn btn-corp" onClick={onResume}>
            Back to work
          </button>
          <button
            className="btn"
            onClick={() => {
              const muted = toggleMute()
              audio.setMuted(muted)
            }}
          >
            {save.muted ? 'Sound: off' : 'Sound: on'}
          </button>
          <button className="btn" onClick={abandon}>
            Abandon the drive
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

/* ------------------------------------------------------------------ parts */

export function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-gradient-to-b from-[#2a1409] via-[#4a2412] to-[#1a1008] p-6">
      <div className="scroll-thin my-auto">{children}</div>
    </div>
  )
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <span className="masthead text-2xl font-bold tracking-[0.16em]">{title}</span>
      {subtitle && <span className="text-sm tracking-[0.2em] text-corp-yellow">{subtitle}</span>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.24em] text-ink/50">{label}</div>
      <div className="text-xl font-bold text-ink">{value}</div>
    </div>
  )
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** A short, dry line for the results screen, picked by how the drive went. */
export function useControllerLine(passed: boolean, delivered: number, start: number): string {
  const [line] = useState(() => {
    if (!passed) {
      return 'Fewer than four head. The Controller has docked your pay and filed the shortfall. Run it again.'
    }
    if (delivered === start) return 'Full count. The Controller has nothing to say, which is as close as he gets to pleased.'
    if (delivered >= start - 1) return 'One short. Filed as acceptable wastage. Trans-Time thanks you.'
    if (delivered >= start - 3) return 'A few head down. The Controller notes it and moves on.'
    return 'A thin delivery. The Controller reads the number out twice, in case you missed it.'
  })
  return line
}
