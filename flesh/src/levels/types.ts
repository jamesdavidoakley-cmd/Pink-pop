import type { TerrainDef } from '@/world/terrain'
import type { PredatorKind, SpawnTicket } from '@/sim/types'

export interface HerdComposition {
  /** Total head at the pen. This is the number the HUD counts down from. */
  count: number
  /** How many of those are juveniles, at 60% scale. */
  juveniles: number
  /** 0 = all triceratops, 1 = all styracosaurs. Roughly half and half. */
  styracosaurRatio: number
}

export interface LevelDef {
  id: string
  index: number
  name: string
  subtitle: string
  /** Trans-Time's cheerful framing of the job. */
  brief: string
  /** The one thing this level exists to teach. */
  teaches: string
  terrain: TerrainDef
  herd: HerdComposition
  spawns: SpawnTicket[]
  boss?: Extract<PredatorKind, 'bighungry' | 'oldoneeye'>
  /** The Ash Plains lightning that drains calm herd-wide on every flash. */
  storm?: { interval: number; visibility: number }
  /** Bone Gulch's set piece: the herd bolts at the midpoint. */
  scriptedStampede?: { atProgress: number }
  /** Seconds a competent drive should take. Shown on the results screen. */
  par: number
  /**
   * The level's palette.
   *
   * Both ends of the sky gradient are here, not just the top: an earlier
   * version fixed the horizon band globally and every level came out the same
   * burnt orange regardless of what its `sky` said, which made the Ash Plains
   * indistinguishable from the Fern Flats.
   */
  mood: { sky: string; skyLow: string; fog: string; ground: string; fogDensity: number }
}
