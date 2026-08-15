/**
 * XP is only ever added. There are no lives, no game over, and nothing is ever
 * taken away — a bad run just earns less than a good one.
 */

import type { DriveStats, Outcome } from './driveSim'
import type { Level } from './levels'

export interface XpAward {
  id: string
  label: string
  amount: number
}

export interface RunSummary {
  awards: XpAward[]
  total: number
  succeeded: boolean
  outcome: Outcome
}

export function scoreRun(args: {
  level: Level
  outcome: Outcome
  stats: DriveStats
  cratesCarried: number
  predictionCorrect: boolean | null
  newSurfaces: number
  boughtNothing: boolean
}): RunSummary {
  const { level, outcome, stats, cratesCarried, predictionCorrect, newSurfaces, boughtNothing } = args
  const succeeded = outcome === 'delivered' || outcome === 'parked'
  const awards: XpAward[] = []

  if (succeeded) {
    awards.push({ id: 'delivered', label: 'Job done', amount: 50 })
  }

  if (succeeded && stats.cargoLost === 0 && cratesCarried > 0) {
    awards.push({ id: 'intact', label: 'Nothing fell off', amount: 20 })
  }

  if (succeeded && !stats.hadWheelspin) {
    awards.push({ id: 'clean', label: 'Not one wheelspin', amount: 30 })
  }

  if (predictionCorrect === true) {
    awards.push({ id: 'predicted', label: 'You called it right', amount: 15 })
  }

  if (newSurfaces > 0) {
    awards.push({
      id: 'new-surface',
      label: newSurfaces > 1 ? 'New ground under you' : 'New ground under you',
      amount: 25 * newSurfaces,
    })
  }

  if (succeeded && boughtNothing) {
    awards.push({ id: 'no-shopping', label: 'Done with what you had', amount: 40 })
  }

  // Landing a stop right in the middle of the box deserves noticing.
  if (outcome === 'parked' && stats.markError !== null && Math.abs(stats.markError) < 2) {
    awards.push({ id: 'bullseye', label: 'Right on the mark', amount: 25 })
  }

  // Getting a spinning wheel back by lifting off is the whole game.
  if (stats.easedOffToRecover) {
    awards.push({ id: 'eased-off', label: 'You eased off and got it back', amount: 20 })
  }

  // A timer is never a fail state — beating it is simply worth something.
  if (level.timer !== undefined && succeeded && stats.seconds <= level.timer) {
    awards.push({ id: 'in-time', label: 'In good time', amount: 25 })
  }

  if (level.isBoss && succeeded) {
    awards.push({ id: 'boss', label: 'Out-gripped!', amount: 80 })
  }

  return {
    awards,
    total: awards.reduce((sum, a) => sum + a.amount, 0),
    succeeded,
    outcome,
  }
}
