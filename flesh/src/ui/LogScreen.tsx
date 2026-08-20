import { LEVELS } from '@/levels'
import { useGame } from '@/state/store'
import { Backdrop, Header, formatTime } from './Menus'

/**
 * The Trail Boss Log, standalone off the title screen.
 *
 * Cheap to build, and it is what makes people replay: a cumulative count of
 * every head you have got through a gate, every one you have not, and the best
 * drive you have managed on each leg.
 */
export function LogScreen() {
  const save = useGame((s) => s.save)
  const setScreen = useGame((s) => s.setScreen)
  const resetProgress = useGame((s) => s.resetProgress)
  const log = save.log

  const ratio =
    log.totalHeadDelivered + log.totalHeadLost > 0
      ? Math.round((log.totalHeadDelivered / (log.totalHeadDelivered + log.totalHeadLost)) * 100)
      : null

  return (
    <Backdrop>
      <div className="w-[min(52rem,94vw)]">
        <Header title="TRAIL BOSS LOG" subtitle="EARL REAGAN" />

        <div className="panel p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="HEAD DELIVERED" value={log.totalHeadDelivered.toLocaleString('en-GB')} />
            <Figure label="HEAD LOST" value={log.totalHeadLost.toLocaleString('en-GB')} />
            <Figure label="DRIVES MADE" value={String(log.drivesCompleted)} />
            <Figure label="EARNED" value={`${log.totalCreditsEarned.toLocaleString('en-GB')} FC`} />
          </div>
          {ratio !== null && (
            <div className="mt-4 border-t-2 border-paper/25 pt-3">
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.22em] text-paper/60">
                <span>DELIVERY RATE</span>
                <span>{ratio}%</span>
              </div>
              <div className="h-3 border-2 border-paper/70 bg-ink/60">
                <div className="h-full bg-corp-yellow" style={{ width: `${ratio}%` }} />
              </div>
              <p className="mt-2 text-xs italic text-paper/55">
                {log.totalHeadLost === 0
                  ? 'Not one head lost. Trans-Time has no record of anyone doing that before.'
                  : ratio >= 90
                    ? 'Trans-Time considers this an exemplary record and has said so in writing.'
                    : ratio >= 70
                      ? 'Within acceptable wastage. The Controller has no comment.'
                      : 'The Controller has asked to see you about the numbers.'}
              </p>
            </div>
          )}
        </div>

        <div className="panel mt-4 p-5">
          <div className="mb-3 text-sm font-bold tracking-[0.2em] text-corp-yellow">BEST RUN PER DRIVE</div>
          <div className="grid gap-1.5">
            {LEVELS.map((level, i) => {
              const rec = log.levels[level.id]
              return (
                <div key={level.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-paper/15 pb-1.5 text-sm">
                  <span className="text-paper/85">
                    {String(i + 1).padStart(2, '0')} {level.name}
                  </span>
                  <span className="flex gap-4 text-[11px] tracking-[0.12em] text-paper/60">
                    {rec && rec.attempts > 0 ? (
                      <>
                        <span>{rec.bestHead}/{level.herd.count} HEAD</span>
                        <span>{rec.bestCredits.toLocaleString('en-GB')} FC</span>
                        <span>{rec.bestTime > 0 ? formatTime(rec.bestTime) : '—'}</span>
                        <span>{rec.attempts} {rec.attempts === 1 ? 'ATTEMPT' : 'ATTEMPTS'}</span>
                      </>
                    ) : (
                      <span className="text-paper/35">NOT RUN</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button className="btn" onClick={() => setScreen('title')}>
            Back
          </button>
          <button
            className="btn border-corp-red text-corp-red hover:bg-corp-red hover:text-paper"
            onClick={() => {
              if (window.confirm('Wipe the whole record — credits, upgrades and every drive? This cannot be undone.')) {
                resetProgress()
              }
            }}
          >
            Wipe the record
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.22em] text-paper/50">{label}</div>
      <div className="text-2xl font-bold text-paper">{value}</div>
    </div>
  )
}
