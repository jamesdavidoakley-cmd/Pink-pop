/**
 * Fourteen levels. Each one introduces exactly one new thing and nothing else.
 *
 * The titles here are for the level-select tiles and are spoken aloud; a child
 * who cannot read them yet gets the picture and the voice instead.
 */

import type { SurfaceId } from '../physics/constants'
import type { Track, TrackSegment } from '../physics/track'
import type { CrateKind } from '../physics/model'
import type { ConceptId } from '../state/save'

export interface CrateSpec {
  id: string
  mass: number
  kind: CrateKind
  secured?: boolean
}

export type Objective = 'deliver' | 'stop-on-mark' | 'boss-slick' | 'boss-mudzilla' | 'free'

export interface RunSpec {
  crates: CrateSpec[]
  /** Metres from the start; the lorry must come to rest inside the box. */
  markAt?: number
  /** How wide the box is, in metres, either side of the mark. */
  markTolerance?: number
  /** Shown on the load bay as a one-line spoken hint. */
  brief: string
}

export interface Level {
  id: string
  number: number
  title: string
  /** Spoken when the level opens. Child vocabulary only. */
  spoken: string
  objective: Objective
  track: Track
  runs: RunSpec[]
  teaches: ConceptId
  /** Surfaces the player may not have met; forces the predict card. */
  newSurface?: SurfaceId
  /** Kit handed over free when the level opens. */
  grants?: string
  brakeEnabled: boolean
  /** Seconds. Generous, and never a fail state — it only affects a bonus. */
  timer?: number
  /** Gravel uphill bail-out on the runaway descent. */
  escapeLaneAt?: number
  isBoss?: boolean
}

const seg = (
  length: number,
  surface: SurfaceId,
  grade = 0,
  bendRadius: number | null = null,
  bendDir: -1 | 1 = 1,
): TrackSegment => ({ length, surface, grade, bendRadius, bendDir })

const crate = (id: string, mass: number, kind: CrateKind, secured = true): CrateSpec => ({
  id,
  mass,
  kind,
  secured,
})

export const LEVELS: Level[] = [
  {
    id: 'l1',
    number: 1,
    title: 'First load',
    spoken: 'Hold the pedal to go. Take the boxes down the road.',
    objective: 'deliver',
    teaches: 'stickiness',
    newSurface: 'dry_tarmac',
    brakeEnabled: false,
    track: { segments: [seg(140, 'dry_tarmac')] },
    runs: [
      {
        brief: 'A dry road and two light boxes. Easy.',
        crates: [crate('a', 600, 'brick'), crate('b', 500, 'sand')],
      },
    ],
  },
  {
    id: 'l2',
    number: 2,
    title: 'Up the hill',
    spoken: 'There is a hill. Hills ask for more grip.',
    objective: 'deliver',
    teaches: 'budget',
    brakeEnabled: false,
    track: {
      segments: [seg(35, 'dry_tarmac'), seg(70, 'dry_tarmac', 0.22), seg(35, 'dry_tarmac')],
    },
    runs: [
      {
        brief: 'Same road, but it goes up.',
        crates: [crate('a', 700, 'brick'), crate('b', 500, 'sand')],
      },
    ],
  },
  {
    id: 'l3',
    number: 3,
    title: 'Wet leaves',
    spoken: 'Careful. There are wet leaves in the middle of the road.',
    objective: 'deliver',
    teaches: 'stickiness',
    newSurface: 'wet_leaves',
    brakeEnabled: false,
    track: {
      segments: [seg(40, 'dry_tarmac'), seg(55, 'wet_leaves'), seg(45, 'dry_tarmac')],
    },
    runs: [
      {
        brief: 'The road changes under you halfway along.',
        crates: [crate('a', 700, 'brick'), crate('b', 500, 'hay')],
      },
    ],
  },
  {
    id: 'l4',
    number: 4,
    title: 'Front or back?',
    spoken: 'One big box. Where you put it changes everything.',
    objective: 'deliver',
    teaches: 'placement',
    newSurface: 'gravel',
    brakeEnabled: false,
    track: {
      // A short approach on purpose: there is no run-up to hide behind, so
      // the hill has to be pulled rather than coasted.
      segments: [seg(12, 'gravel'), seg(110, 'gravel', 0.12), seg(25, 'gravel')],
    },
    runs: [
      {
        brief: 'Put the big box where it does the most good.',
        crates: [crate('a', 2600, 'pipe')],
      },
    ],
  },
  {
    id: 'l5',
    number: 5,
    title: 'Heavy day',
    spoken: 'A really heavy load. It is fine, if you put it in the right place.',
    objective: 'deliver',
    teaches: 'press',
    newSurface: 'mud',
    brakeEnabled: false,
    track: {
      segments: [seg(30, 'mud'), seg(80, 'mud', 0.06), seg(35, 'mud')],
    },
    runs: [
      {
        brief: 'Three heavy boxes and soft ground.',
        crates: [crate('a', 1400, 'brick'), crate('b', 1200, 'brick'), crate('c', 800, 'barrel')],
      },
    ],
  },
  {
    id: 'l6',
    number: 6,
    title: 'The bends',
    spoken: 'Bends need grip too. Slow down before you turn, not in the middle.',
    objective: 'deliver',
    teaches: 'budget',
    brakeEnabled: true,
    track: {
      segments: [
        seg(40, 'gravel'),
        seg(45, 'gravel', 0, 34, 1),
        seg(30, 'gravel'),
        seg(45, 'gravel', 0, 28, -1),
        seg(40, 'gravel'),
      ],
    },
    runs: [
      {
        brief: 'Two bends in the gravel yard.',
        crates: [crate('a', 1200, 'pipe'), crate('b', 900, 'barrel')],
      },
    ],
  },
  {
    id: 'l7',
    number: 7,
    title: 'Stop on the mark',
    spoken: 'Now you have a brake. Stop inside the orange box.',
    objective: 'stop-on-mark',
    teaches: 'stopping',
    newSurface: 'wet_tarmac',
    brakeEnabled: true,
    track: { segments: [seg(150, 'wet_tarmac')] },
    runs: [
      {
        brief: 'Light load. Stop in the box.',
        crates: [crate('a', 600, 'sand')],
        markAt: 110,
        markTolerance: 7,
      },
      {
        brief: 'Now the same box, with a lot more on the back.',
        crates: [crate('a', 600, 'sand'), crate('b', 1800, 'brick'), crate('c', 1600, 'brick')],
        markAt: 110,
        markTolerance: 7,
      },
    ],
  },
  {
    id: 'l8',
    number: 8,
    title: 'Mud track',
    spoken: 'New tyres! Big knobbly ones. They love mud.',
    objective: 'deliver',
    teaches: 'stickiness',
    grants: 'knobbly',
    brakeEnabled: true,
    track: {
      segments: [seg(30, 'mud'), seg(85, 'mud', 0.1), seg(30, 'mud', 0.02)],
    },
    runs: [
      {
        brief: 'Deep mud, all the way up.',
        crates: [crate('a', 1400, 'log'), crate('b', 1000, 'log')],
      },
    ],
  },
  {
    id: 'l9',
    number: 9,
    title: 'Ice bridge',
    spoken: 'Ice. Tap the sand button to help your wheels bite.',
    objective: 'deliver',
    teaches: 'recovery',
    newSurface: 'ice',
    grants: 'sand',
    brakeEnabled: true,
    track: {
      segments: [seg(25, 'dry_tarmac'), seg(45, 'ice'), seg(45, 'ice', 0.05), seg(30, 'dry_tarmac')],
    },
    runs: [
      {
        brief: 'Over the frozen bridge. Gently does it.',
        crates: [crate('a', 1000, 'barrel'), crate('b', 800, 'barrel')],
      },
    ],
  },
  {
    id: 'l10',
    number: 10,
    title: 'Slick',
    spoken: 'Slick the ice snake is freezing the road ahead. Out-grip him.',
    objective: 'boss-slick',
    teaches: 'recovery',
    newSurface: 'snow',
    brakeEnabled: true,
    isBoss: true,
    track: {
      segments: [
        seg(60, 'wet_tarmac'),
        seg(70, 'snow'),
        seg(60, 'snow'),
        seg(70, 'snow', 0.09),
        seg(30, 'dry_tarmac'),
      ],
    },
    runs: [
      {
        brief: 'Slick is up ahead. Keep your wheels turning.',
        crates: [crate('a', 1200, 'barrel'), crate('b', 900, 'sand'), crate('c', 700, 'sand')],
      },
    ],
  },
  {
    id: 'l11',
    number: 11,
    title: 'Tip site',
    spoken: 'A steep one. Tap the lift button to press your back wheels down.',
    objective: 'deliver',
    teaches: 'press',
    grants: 'liftaxle',
    brakeEnabled: true,
    track: {
      segments: [seg(10, 'gravel'), seg(95, 'gravel', 0.28), seg(25, 'gravel', 0.04)],
    },
    runs: [
      {
        brief: 'Straight up the tip. Use everything you have.',
        crates: [crate('a', 1600, 'brick'), crate('b', 1100, 'brick')],
      },
    ],
  },
  {
    id: 'l12',
    number: 12,
    title: 'Everything road',
    spoken: 'Every kind of ground, one after another. Take your time.',
    objective: 'deliver',
    teaches: 'stickiness',
    brakeEnabled: true,
    timer: 150,
    track: {
      segments: [
        seg(35, 'dry_tarmac'),
        seg(40, 'wet_tarmac', 0.04),
        seg(40, 'gravel', 0, 40, 1),
        seg(40, 'wet_leaves'),
        seg(45, 'mud', 0.08),
        seg(40, 'snow'),
        seg(30, 'dry_tarmac'),
      ],
    },
    runs: [
      {
        brief: 'Six different grounds. One load.',
        crates: [crate('a', 1300, 'pipe'), crate('b', 900, 'hay'), crate('c', 700, 'barrel')],
      },
    ],
  },
  {
    id: 'l13',
    number: 13,
    title: 'Runaway',
    spoken: 'Downhill, and it is wet. If it runs away, take the gravel lane.',
    objective: 'stop-on-mark',
    teaches: 'stopping',
    brakeEnabled: true,
    escapeLaneAt: 118,
    track: {
      segments: [seg(25, 'wet_tarmac'), seg(105, 'wet_tarmac', -0.14), seg(45, 'wet_tarmac')],
    },
    runs: [
      {
        brief: 'A long hill down. Stop in the box at the bottom.',
        crates: [crate('a', 1800, 'brick'), crate('b', 1500, 'brick')],
        markAt: 152,
        markTolerance: 8,
      },
    ],
  },
  {
    id: 'l14',
    number: 14,
    title: 'Mudzilla',
    spoken: 'Mudzilla is throwing mud on your cab. Shovel it off and get up the quarry.',
    objective: 'boss-mudzilla',
    teaches: 'mass-cost',
    brakeEnabled: true,
    isBoss: true,
    track: {
      segments: [
        seg(40, 'mud'),
        seg(80, 'mud', 0.11),
        seg(60, 'mud', 0.16),
        seg(30, 'gravel'),
        seg(90, 'mud', -0.15),
        seg(35, 'gravel'),
      ],
    },
    runs: [
      {
        brief: 'Up the quarry, then all the way back down.',
        crates: [crate('a', 1500, 'log'), crate('b', 1200, 'log'), crate('c', 900, 'barrel')],
        markAt: 322,
        markTolerance: 10,
      },
    ],
  },
]

/**
 * The free-play yard. Its track and load are rebuilt every time the child
 * presses "build it", which is why this one is a let rather than a const.
 */
export let FREE_PLAY: Level = {
  id: 'free',
  number: 15,
  title: 'The yard',
  spoken: 'Your own yard. Build whatever you like and break it.',
  objective: 'free',
  teaches: 'stickiness',
  brakeEnabled: true,
  track: { segments: [seg(400, 'dry_tarmac')] },
  runs: [{ brief: 'Anything you like.', crates: [] }],
}

export function configureFreePlay(options: {
  surface: SurfaceId
  grade: number
  bends: boolean
  crates: CrateSpec[]
}): void {
  const { surface, grade, bends, crates } = options
  FREE_PLAY = {
    ...FREE_PLAY,
    track: {
      segments: [
        seg(30, surface),
        seg(140, surface, grade, bends ? 34 : null, 1),
        seg(60, surface, grade * 0.4),
        seg(120, surface, -grade, bends ? 30 : null, -1),
        seg(50, surface),
      ],
    },
    runs: [{ brief: 'Your yard, your rules.', crates }],
  }
}

export const levelById = (id: string): Level | undefined =>
  id === 'free' ? FREE_PLAY : LEVELS.find((l) => l.id === id)

/** A level is open once the one before it is done. Level 1 is always open. */
export function isUnlocked(level: Level, completed: Set<string>): boolean {
  if (level.number === 1) return true
  const previous = LEVELS[level.number - 2]
  return previous ? completed.has(previous.id) : false
}

export const freePlayUnlocked = (completed: Set<string>): boolean => completed.has('l14')
