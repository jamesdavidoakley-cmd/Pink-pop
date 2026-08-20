/**
 * Three settings, as specified. The brief's rule holds across all of them:
 * there is no fail-and-restart-from-zero. You always reach the gate; losing
 * head is the punishment. The one exception is the hardest setting, where
 * "permadeath on head lost" means a single loss ends the drive.
 */

export type DifficultyId = 'ranger' | 'trailboss' | 'oldoneeye'

export interface DifficultyTuning {
  id: DifficultyId
  name: string
  blurb: string
  /** Multiplier on every source of calm drain. */
  calmDrainScale: number
  /** Distance from the matriarch at which an animal becomes a straggler. */
  stragglerLeash: number
  /** Rifle hits inside the combo window needed to put a predator down. */
  hitsToDrop: number
  /** Losing a single head ends the drive. */
  permadeath: boolean
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyTuning> = {
  ranger: {
    id: 'ranger',
    name: 'RANGER',
    blurb: 'First drive. The herd forgives. Rexes go down easy.',
    calmDrainScale: 0.6,
    stragglerLeash: 60,
    hitsToDrop: 2,
    permadeath: false,
  },
  trailboss: {
    id: 'trailboss',
    name: 'TRAIL BOSS',
    blurb: 'The job as Trans-Time writes it. Recommended.',
    calmDrainScale: 1,
    stragglerLeash: 40,
    hitsToDrop: 3,
    permadeath: false,
  },
  oldoneeye: {
    id: 'oldoneeye',
    name: 'OLD ONE EYE',
    blurb: 'Nervy herd, short leash, hard rexes. Lose one head and the drive is over.',
    calmDrainScale: 1.5,
    stragglerLeash: 30,
    hitsToDrop: 4,
    permadeath: true,
  },
}

export const DIFFICULTY_ORDER: DifficultyId[] = ['ranger', 'trailboss', 'oldoneeye']
