import { useEffect } from 'react'
import { CREDITS, MIN_HEAD_TO_PASS } from '@/core/tuning'
import { LEVELS } from '@/levels'
import { audio } from '@/audio/engine'
import { useGame } from '@/state/store'
import { Backdrop, Header, formatTime, useControllerLine } from './Menus'

/**
 * The pay slip.
 *
 * Trans-Time reports the drive as logistics, the way the strip does: head
 * delivered, head lost, a line for wastage, and a total. The tone is the point —
 * the corporation is never angry and never sorry, it just files the number.
 */

export function ResultsScreen() {
  const result = useGame((s) => s.result)
  const save = useGame((s) => s.save)
  const startLevel = useGame((s) => s.startLevel)
  const setScreen = useGame((s) => s.setScreen)

  useEffect(() => {
    if (!result) return
    if (result.passed) audio.westernSting()
    else audio.corporate()
  }, [result])

  const line = useControllerLine(result?.passed ?? false, result?.headDelivered ?? 0, result?.headStart ?? 0)
  if (!result) return null

  const lines: { label: string; amount: number }[] = [
    { label: `${result.headDelivered} head delivered @ ${CREDITS.perHead}`, amount: result.headDelivered * CREDITS.perHead },
  ]
  if (result.headPrime > 0) {
    lines.push({
      label: `${result.headPrime} in prime condition @ ${CREDITS.primeBonus}`,
      amount: result.headPrime * CREDITS.primeBonus,
    })
  }
  if (result.stragglersLost === 0) {
    lines.push({ label: 'No stragglers lost', amount: CREDITS.noStragglersLost })
  }
  if (result.shotsFired === 0) {
    lines.push({ label: 'Rifle never fired', amount: CREDITS.pacifist })
  }

  const nextIndex = result.levelIndex + 1
  const hasNext = nextIndex < LEVELS.length && nextIndex < save.levelsUnlocked

  return (
    <Backdrop>
      <div className="w-[min(46rem,92vw)]">
        <Header
          title={result.passed ? 'DELIVERY ACCEPTED' : 'DELIVERY SHORT'}
          subtitle={result.levelName}
        />

        <div className="corp-panel p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="DELIVERED" value={`${result.headDelivered}/${result.headStart}`} big />
            <Figure label="LOST" value={String(result.headLost)} />
            <Figure label="SHOTS FIRED" value={String(result.shotsFired)} />
            <Figure label="TIME" value={formatTime(result.time)} sub={`par ${formatTime(result.par)}`} />
          </div>

          <div className="mt-5 border-t-2 border-ink pt-4">
            {lines.map((l) => (
              <div key={l.label} className="flex justify-between py-0.5 text-sm text-ink">
                <span>{l.label}</span>
                <span className="font-bold">{l.amount.toLocaleString('en-GB')}</span>
              </div>
            ))}
            {lines.length === 1 && result.shotsFired > 0 && (
              <div className="py-0.5 text-xs italic text-ink/50">
                No bonus earned. A quieter drive pays better than a busy one.
              </div>
            )}
            <div className="mt-3 flex justify-between border-t-2 border-ink pt-3 text-lg font-bold text-ink">
              <span>TOTAL</span>
              <span>{result.credits.toLocaleString('en-GB')} FC</span>
            </div>
          </div>

          {!result.passed && (
            <div className="mt-4 border-2 border-corp-red bg-corp-red/10 p-3 text-xs text-ink">
              Minimum delivery is {MIN_HEAD_TO_PASS} head. Below that the drive does not count.
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-sm italic text-paper/70">{line}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {result.passed && hasNext && (
            <button className="btn btn-corp text-lg" onClick={() => startLevel(nextIndex)}>
              Next drive
            </button>
          )}
          <button className="btn" onClick={() => startLevel(result.levelIndex)}>
            {result.passed ? 'Run it again' : 'Run it again'}
          </button>
          <button className="btn" onClick={() => setScreen('commissary')}>
            Commissary
          </button>
          <button className="btn" onClick={() => setScreen('levelSelect')}>
            Mission board
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

function Figure({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.24em] text-ink/50">{label}</div>
      <div className={`font-bold text-ink ${big ? 'text-3xl' : 'text-2xl'}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink/50">{sub}</div>}
    </div>
  )
}
