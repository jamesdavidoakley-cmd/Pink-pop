/**
 * Two profiles, saved locally, never sent anywhere. No accounts, no cloud, no
 * leaderboard. If local storage is unavailable the game still runs, it just
 * forgets between sessions.
 */

import type { SurfaceId, TyreId } from '../physics/constants'

export type ConceptId =
  | 'stickiness'
  | 'press'
  | 'placement'
  | 'budget'
  | 'recovery'
  | 'mass-cost'
  | 'stopping'

export const CONCEPTS: { id: ConceptId; grownUpLabel: string; evidence: string }[] = [
  {
    id: 'stickiness',
    grownUpLabel: 'Surfaces differ',
    evidence: 'Drives differently on ice than on tarmac without being told to.',
  },
  {
    id: 'press',
    grownUpLabel: 'Load on the driven wheel',
    evidence: 'Adds weight over the drive axle when grip is short.',
  },
  {
    id: 'placement',
    grownUpLabel: 'Where the weight sits',
    evidence: 'Moves the same cargo rearward rather than adding more of it.',
  },
  {
    id: 'budget',
    grownUpLabel: 'One budget, three jobs',
    evidence: 'Slows before a bend instead of steering harder through it.',
  },
  {
    id: 'recovery',
    grownUpLabel: 'Easing off restores grip',
    evidence: 'Lifts off when a wheel spins rather than pressing harder.',
  },
  {
    id: 'mass-cost',
    grownUpLabel: 'Weight is not free',
    evidence: 'Sheds ballast for a hill or a stop, having added it for grip.',
  },
  {
    id: 'stopping',
    grownUpLabel: 'Stopping needs grip too',
    evidence: 'Leaves room, and loads forward when a stop is what matters.',
  },
]

export interface Fitted {
  tyres: TyreId
  wheelWeights: boolean
  liftAxle: boolean
  sandHopper: boolean
  boards: boolean
  ballastTank: boolean
}

export interface Cosmetics {
  paint: string
  horn: string
  dog: boolean
  hat: string
  mudflaps: boolean
  /** The child's own name signwritten on the cab door. */
  signwriting: string
}

export interface LevelRecord {
  completed: boolean
  cleanRun: boolean
  cargoIntact: boolean
  boughtNothing: boolean
  bestTime: number | null
}

export interface Settings {
  reducedMotion: boolean
  narration: boolean
  sound: boolean
  showNumbers: boolean
}

export interface Profile {
  slot: 0 | 1
  name: string
  colour: string
  xp: number
  owned: string[]
  fitted: Fitted
  cosmetics: Cosmetics
  levels: Record<string, LevelRecord>
  seenSurfaces: SurfaceId[]
  predictions: { correct: number; total: number }
  /** Counts of behaviour that shows a concept has landed. */
  mastery: Record<ConceptId, number>
  settings: Settings
  created: boolean
}

const STORAGE_KEY = 'grit.save.v1'

export const defaultFitted = (): Fitted => ({
  tyres: 'road',
  wheelWeights: false,
  liftAxle: false,
  sandHopper: false,
  boards: false,
  ballastTank: false,
})

export const defaultCosmetics = (): Cosmetics => ({
  paint: 'haulage',
  horn: 'none',
  dog: false,
  hat: 'none',
  mudflaps: false,
  signwriting: '',
})

const emptyMastery = (): Record<ConceptId, number> => ({
  stickiness: 0,
  press: 0,
  placement: 0,
  budget: 0,
  recovery: 0,
  'mass-cost': 0,
  stopping: 0,
})

export const newProfile = (slot: 0 | 1): Profile => ({
  slot,
  name: slot === 0 ? 'Driver 1' : 'Driver 2',
  colour: slot === 0 ? '#1F5C3C' : '#FF6A13',
  xp: 0,
  owned: [],
  fitted: defaultFitted(),
  cosmetics: defaultCosmetics(),
  levels: {},
  seenSurfaces: [],
  predictions: { correct: 0, total: 0 },
  mastery: emptyMastery(),
  settings: {
    reducedMotion: false,
    narration: true,
    sound: true,
    showNumbers: false,
  },
  created: false,
})

export interface SaveFile {
  profiles: [Profile, Profile]
  lastSlot: 0 | 1
}

export const newSave = (): SaveFile => ({
  profiles: [newProfile(0), newProfile(1)],
  lastSlot: 0,
})

/** Merge a loaded profile over the current defaults, so old saves survive. */
function reviveProfile(raw: unknown, slot: 0 | 1): Profile {
  const base = newProfile(slot)
  if (!raw || typeof raw !== 'object') return base
  const p = raw as Partial<Profile>
  return {
    ...base,
    ...p,
    slot,
    fitted: { ...base.fitted, ...(p.fitted ?? {}) },
    cosmetics: { ...base.cosmetics, ...(p.cosmetics ?? {}) },
    settings: { ...base.settings, ...(p.settings ?? {}) },
    mastery: { ...base.mastery, ...(p.mastery ?? {}) },
    predictions: { ...base.predictions, ...(p.predictions ?? {}) },
    levels: { ...(p.levels ?? {}) },
    seenSurfaces: Array.isArray(p.seenSurfaces) ? p.seenSurfaces : [],
    owned: Array.isArray(p.owned) ? p.owned : [],
  }
}

export function loadSave(): SaveFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return newSave()
    const parsed = JSON.parse(raw) as Partial<SaveFile>
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : []
    return {
      profiles: [reviveProfile(profiles[0], 0), reviveProfile(profiles[1], 1)],
      lastSlot: parsed.lastSlot === 1 ? 1 : 0,
    }
  } catch {
    return newSave()
  }
}

export function writeSave(save: SaveFile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  } catch {
    // A full or disabled store is not worth interrupting a six year old for.
  }
}
