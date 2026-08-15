/**
 * Working out which bit of a level is the hard bit.
 *
 * The load bay and the predict card both need to show the player the moment
 * that will actually catch them out, rather than the average of the whole
 * road — otherwise the meter says "fine" right up until it very much is not.
 */

import { computeBudget, TYPICAL_THROTTLE, type Budget, type Conditions, type Rig } from '../physics/model'
import type { SurfaceId } from '../physics/constants'
import type { Level } from './levels'

export interface HardestPoint {
  conditions: Conditions
  budget: Budget
  surface: SurfaceId
  /** Negative means the wheel lets go there at a normal throttle. */
  margin: number
}

/**
 * The worst margin anywhere on the track, at the throttle a child actually
 * uses. Sand and boards are deliberately excluded: this is the road as it
 * stands, before you spend anything on it.
 */
export function hardestPoint(level: Level, rig: Rig, throttle = TYPICAL_THROTTLE): HardestPoint {
  let worst: HardestPoint | null = null

  for (const segment of level.track.segments) {
    const conditions: Conditions = {
      surface: segment.surface,
      slope: segment.grade,
      bendRadius: segment.bendRadius ?? null,
      sandActive: false,
      onBoards: false,
    }
    // Bends only bite at speed, so judge them at a plausible cornering speed.
    const v = segment.bendRadius ? 9 : 0
    const budget = computeBudget(rig, conditions, { throttle, brake: 0 }, { v, isSlipping: false })
    const margin = budget.gripAvailable - budget.demand

    if (!worst || margin < worst.margin) {
      worst = { conditions, budget, surface: segment.surface, margin }
    }
  }

  // Every level has at least one segment, but keep the types honest.
  return (
    worst ?? {
      conditions: { surface: 'dry_tarmac', slope: 0, bendRadius: null, sandActive: false, onBoards: false },
      budget: computeBudget(
        rig,
        { surface: 'dry_tarmac', slope: 0, bendRadius: null, sandActive: false, onBoards: false },
        { throttle, brake: 0 },
        { v: 0, isSlipping: false },
      ),
      surface: 'dry_tarmac',
      margin: 0,
    }
  )
}

/** The honest answer to "will it grip?" for the predict card. */
export const predictedToGrip = (level: Level, rig: Rig): boolean => hardestPoint(level, rig).margin >= 0
