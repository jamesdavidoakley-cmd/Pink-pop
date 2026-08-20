/**
 * Persistence. Everything the player owns lives under one localStorage key,
 * `flesh_save`, as the brief asks.
 *
 * Loading is deliberately paranoid: a save from an older build, a truncated
 * string, or a key someone has poked at by hand must all degrade to a fresh
 * profile rather than throwing on boot. Losing a save is annoying; a game that
 * will not start is worse.
 */

import { DIFFICULTIES, type DifficultyId } from './difficulty'

export const SAVE_KEY = 'flesh_save'
export const SAVE_VERSION = 1

export interface LevelRecord {
  /** Best credits earned on this level in a single drive. */
  bestCredits: number
  /** Most head delivered in a single drive. */
  bestHead: number
  /** Fastest completion, seconds. */
  bestTime: number
  completed: boolean
  attempts: number
}

export interface TrailBossLog {
  totalHeadDelivered: number
  totalHeadLost: number
  totalCreditsEarned: number
  drivesCompleted: number
  levels: Record<string, LevelRecord>
}

export interface OwnedUpgrades {
  netGun: boolean
  sonicBoomer: boolean
  drone: boolean
  herdCalmer: boolean
  /** Purchased tiers, 0..3. */
  stamina: number
  recharge: number
  bike: number
}

export interface SaveData {
  version: number
  credits: number
  difficulty: DifficultyId
  levelsUnlocked: number
  upgrades: OwnedUpgrades
  hat: string
  hatsOwned: string[]
  muted: boolean
  log: TrailBossLog
}

export const emptyLog = (): TrailBossLog => ({
  totalHeadDelivered: 0,
  totalHeadLost: 0,
  totalCreditsEarned: 0,
  drivesCompleted: 0,
  levels: {},
})

export const emptyUpgrades = (): OwnedUpgrades => ({
  netGun: false,
  sonicBoomer: false,
  drone: false,
  herdCalmer: false,
  stamina: 0,
  recharge: 0,
  bike: 0,
})

export const defaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  credits: 0,
  difficulty: 'trailboss',
  levelsUnlocked: 1,
  upgrades: emptyUpgrades(),
  hat: 'trail',
  hatsOwned: ['trail'],
  muted: false,
  log: emptyLog(),
})

/** Where to persist. Injectable so tests can run without a DOM. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    // Private browsing, blocked storage, a sandboxed iframe. Play anyway.
    return null
  }
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

/** Coerce whatever came out of storage into a save we are willing to run on. */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>

  const upgradesRaw = (r.upgrades ?? {}) as Record<string, unknown>
  const logRaw = (r.log ?? {}) as Record<string, unknown>
  const levelsRaw = (logRaw.levels ?? {}) as Record<string, unknown>

  const levels: Record<string, LevelRecord> = {}
  for (const [id, v] of Object.entries(levelsRaw)) {
    const rec = (v ?? {}) as Record<string, unknown>
    levels[id] = {
      bestCredits: num(rec.bestCredits, 0),
      bestHead: num(rec.bestHead, 0),
      bestTime: num(rec.bestTime, 0),
      completed: bool(rec.completed, false),
      attempts: num(rec.attempts, 0),
    }
  }

  const difficulty = r.difficulty as DifficultyId
  const hats = Array.isArray(r.hatsOwned) ? (r.hatsOwned as unknown[]).filter((h) => typeof h === 'string') : null

  return {
    version: SAVE_VERSION,
    credits: Math.max(0, Math.floor(num(r.credits, 0))),
    difficulty: difficulty in DIFFICULTIES ? difficulty : base.difficulty,
    levelsUnlocked: Math.max(1, Math.floor(num(r.levelsUnlocked, 1))),
    upgrades: {
      netGun: bool(upgradesRaw.netGun, false),
      sonicBoomer: bool(upgradesRaw.sonicBoomer, false),
      drone: bool(upgradesRaw.drone, false),
      herdCalmer: bool(upgradesRaw.herdCalmer, false),
      stamina: Math.max(0, Math.floor(num(upgradesRaw.stamina, 0))),
      recharge: Math.max(0, Math.floor(num(upgradesRaw.recharge, 0))),
      bike: Math.max(0, Math.floor(num(upgradesRaw.bike, 0))),
    },
    hat: typeof r.hat === 'string' ? r.hat : base.hat,
    hatsOwned: hats && hats.length ? (hats as string[]) : base.hatsOwned,
    muted: bool(r.muted, false),
    log: {
      totalHeadDelivered: num(logRaw.totalHeadDelivered, 0),
      totalHeadLost: num(logRaw.totalHeadLost, 0),
      totalCreditsEarned: num(logRaw.totalCreditsEarned, 0),
      drivesCompleted: num(logRaw.drivesCompleted, 0),
      levels,
    },
  }
}

export function loadSave(storage: StorageLike | null = defaultStorage()): SaveData {
  if (!storage) return defaultSave()
  try {
    const raw = storage.getItem(SAVE_KEY)
    if (!raw) return defaultSave()
    return migrate(JSON.parse(raw))
  } catch {
    return defaultSave()
  }
}

export function writeSave(data: SaveData, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // Quota, or storage disabled mid-session. Nothing useful to do about it.
  }
}

export function clearSave(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}

/** Fold one finished drive into the cumulative Trail Boss Log. */
export function recordDrive(
  save: SaveData,
  levelId: string,
  levelIndex: number,
  result: { credits: number; headDelivered: number; headLost: number; time: number; passed: boolean },
): SaveData {
  const levels = { ...save.log.levels }
  const prev = levels[levelId] ?? { bestCredits: 0, bestHead: 0, bestTime: 0, completed: false, attempts: 0 }
  levels[levelId] = {
    bestCredits: Math.max(prev.bestCredits, result.credits),
    bestHead: Math.max(prev.bestHead, result.headDelivered),
    bestTime:
      result.passed && (prev.bestTime === 0 || result.time < prev.bestTime) ? result.time : prev.bestTime,
    completed: prev.completed || result.passed,
    attempts: prev.attempts + 1,
  }

  return {
    ...save,
    credits: save.credits + result.credits,
    // Clearing a level unlocks the next one, and never re-locks it.
    levelsUnlocked: result.passed
      ? Math.max(save.levelsUnlocked, levelIndex + 2)
      : save.levelsUnlocked,
    log: {
      totalHeadDelivered: save.log.totalHeadDelivered + result.headDelivered,
      totalHeadLost: save.log.totalHeadLost + result.headLost,
      totalCreditsEarned: save.log.totalCreditsEarned + result.credits,
      drivesCompleted: save.log.drivesCompleted + (result.passed ? 1 : 0),
      levels,
    },
  }
}
