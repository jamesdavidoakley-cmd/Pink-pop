import { create } from 'zustand'
import { DIFFICULTIES, type DifficultyId } from './difficulty'
import {
  defaultSave,
  loadSave,
  recordDrive,
  writeSave,
  type OwnedUpgrades,
  type SaveData,
} from './save'
import { LEVELS } from '@/levels'
import { createWorld } from '@/sim/world'
import type { ActiveUpgrades, World } from '@/sim/types'
import type { HatKind } from '@/art/rigs/Reagan'

/**
 * Screen state, the profile, and the live world.
 *
 * The world itself is a mutable object stepped sixty times a second. It is
 * *held* here but never treated as reactive state — nothing subscribes to it,
 * and the HUD reads it directly on its own animation frame. Pushing a
 * twelve-animal simulation through React's scheduler every tick is the fastest
 * way to lose the frame budget the brief asks for.
 */

export type Screen =
  | 'title'
  | 'levelSelect'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'results'
  | 'commissary'
  | 'log'

export interface RunResult {
  levelId: string
  levelIndex: number
  levelName: string
  passed: boolean
  headDelivered: number
  headStart: number
  headLost: number
  headPrime: number
  stragglersLost: number
  shotsFired: number
  time: number
  credits: number
  par: number
}

export interface Toast {
  id: number
  text: string
  at: number
}

interface GameStore {
  screen: Screen
  save: SaveData
  world: World | null
  levelIndex: number
  result: RunResult | null
  toasts: Toast[]
  mapOpen: boolean
  /** Bumped whenever something the menus care about changes. */
  revision: number

  setScreen: (screen: Screen) => void
  setDifficulty: (id: DifficultyId) => void
  startLevel: (index: number) => void
  abandonRun: () => void
  finishRun: (world: World) => void
  pushToast: (text: string) => void
  expireToasts: (now: number) => void
  setMapOpen: (open: boolean) => void
  toggleMute: () => boolean
  buyUpgrade: (id: UpgradeId) => boolean
  setHat: (hat: HatKind) => void
  buyHat: (hat: HatKind, price: number) => boolean
  resetProgress: () => void
}

/* ----------------------------------------------------------- upgrades */

export type UpgradeId =
  | 'netGun'
  | 'sonicBoomer'
  | 'drone'
  | 'herdCalmer'
  | 'stamina'
  | 'recharge'
  | 'bike'

export interface UpgradeDef {
  id: UpgradeId
  name: string
  blurb: string
  /** One-shot unlocks have a single price; tiered ones scale. */
  price: number
  maxTier?: number
}

/** The commissary stock. Prices are set against a good drive paying ~1,900. */
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'netGun',
    name: 'Net Gun',
    blurb: 'One shot. Roots a rex where it stands for twelve seconds. Forty second cooldown.',
    price: 1400,
  },
  {
    id: 'sonicBoomer',
    name: 'Sonic Boomer',
    blurb: 'Shoves everything within twelve metres outward. Panics your own herd too. A real panic button, with a real cost.',
    price: 1800,
  },
  {
    id: 'drone',
    name: 'Spotter Drone',
    blurb: 'Circles overhead. Marks predators through terrain on the map ten seconds before they come in.',
    price: 2200,
  },
  {
    id: 'herdCalmer',
    name: 'Herd Calmer',
    blurb: 'Doubles the calm your presence restores. Passive. Trans-Time makes no claims as to how it works.',
    price: 2600,
  },
  { id: 'stamina', name: 'Sprint Rig', blurb: 'More stamina, and it comes back faster.', price: 700, maxTier: 3 },
  { id: 'recharge', name: 'Rifle Coils', blurb: 'The stun rifle recharges quicker between shots.', price: 700, maxTier: 3 },
  { id: 'bike', name: 'Bike Tuning', blurb: 'Higher top speed on the hover bike. For fetching stragglers.', price: 700, maxTier: 3 },
]

export function upgradePrice(def: UpgradeDef, owned: OwnedUpgrades): number {
  if (!def.maxTier) return def.price
  const tier = owned[def.id as 'stamina' | 'recharge' | 'bike']
  return Math.round(def.price * (1 + tier * 0.8))
}

export function upgradeTier(def: UpgradeDef, owned: OwnedUpgrades): number {
  if (!def.maxTier) return owned[def.id as 'netGun'] ? 1 : 0
  return owned[def.id as 'stamina' | 'recharge' | 'bike']
}

export function toActiveUpgrades(owned: OwnedUpgrades): ActiveUpgrades {
  return {
    netGun: owned.netGun,
    sonicBoomer: owned.sonicBoomer,
    drone: owned.drone,
    herdCalmer: owned.herdCalmer,
    staminaLevel: owned.stamina,
    rechargeLevel: owned.recharge,
    bikeLevel: owned.bike,
  }
}

/* -------------------------------------------------------------- the store */

let toastId = 1

export const useGame = createStore()

function createStore() {
  return create<GameStore>((set, get) => ({
  screen: 'title',
  save: loadSave(),
  world: null,
  levelIndex: 0,
  result: null,
  toasts: [],
  mapOpen: false,
  revision: 0,

  setScreen: (screen) => set({ screen }),

  setDifficulty: (id) => {
    const save = { ...get().save, difficulty: id }
    writeSave(save)
    set({ save, revision: get().revision + 1 })
  },

  startLevel: (index) => {
    const level = LEVELS[index]
    if (!level) return
    const { save } = get()
    const world = createWorld({
      level,
      difficulty: DIFFICULTIES[save.difficulty],
      upgrades: toActiveUpgrades(save.upgrades),
      // A fresh seed per attempt, so a replay is not the same drive twice.
      seed: (level.terrain.seed ^ (Date.now() & 0xffff)) >>> 0,
    })
    set({ world, levelIndex: index, screen: 'playing', result: null, toasts: [], mapOpen: false })
  },

  abandonRun: () => set({ world: null, screen: 'levelSelect', toasts: [] }),

  finishRun: (world) => {
    const index = get().levelIndex
    const level = LEVELS[index]!
    const passed = world.phase === 'complete'
    const result: RunResult = {
      levelId: level.id,
      levelIndex: index,
      levelName: level.name,
      passed,
      headDelivered: world.stats.headDelivered,
      headStart: world.stats.headStart,
      headLost: world.stats.headLost,
      headPrime: world.stats.headPrime,
      stragglersLost: world.stats.stragglersLost,
      shotsFired: world.stats.shotsFired,
      time: world.stats.timeElapsed,
      credits: world.stats.creditsEarned,
      par: level.par,
    }
    const save = recordDrive(get().save, level.id, index, {
      credits: result.credits,
      headDelivered: result.headDelivered,
      headLost: result.headLost,
      time: result.time,
      passed,
    })
    writeSave(save)
    set({ result, save, screen: 'results', revision: get().revision + 1 })
  },

  pushToast: (text) => {
    const toasts = get().toasts
    // Never stack the same line twice — the Controller repeats himself enough.
    if (toasts.length && toasts[toasts.length - 1]!.text === text) return
    set({
      toasts: [...toasts, { id: toastId++, text, at: performance.now() }].slice(-4),
    })
  },

  expireToasts: (now) => {
    const toasts = get().toasts.filter((t) => now - t.at < 5200)
    if (toasts.length !== get().toasts.length) set({ toasts })
  },

  setMapOpen: (open) => set({ mapOpen: open }),

  toggleMute: () => {
    const save = { ...get().save, muted: !get().save.muted }
    writeSave(save)
    set({ save, revision: get().revision + 1 })
    return save.muted
  },

  buyUpgrade: (id) => {
    const def = UPGRADES.find((u) => u.id === id)
    if (!def) return false
    const { save } = get()
    const owned = save.upgrades
    const tier = upgradeTier(def, owned)
    if (def.maxTier ? tier >= def.maxTier : tier >= 1) return false
    const price = upgradePrice(def, owned)
    if (save.credits < price) return false

    const upgrades: OwnedUpgrades = { ...owned }
    if (def.maxTier) {
      upgrades[def.id as 'stamina' | 'recharge' | 'bike'] = tier + 1
    } else {
      upgrades[def.id as 'netGun'] = true
    }
    const next = { ...save, credits: save.credits - price, upgrades }
    writeSave(next)
    set({ save: next, revision: get().revision + 1 })
    return true
  },

  setHat: (hat) => {
    const save = { ...get().save, hat }
    writeSave(save)
    set({ save, revision: get().revision + 1 })
  },

  buyHat: (hat, price) => {
    const { save } = get()
    if (save.hatsOwned.includes(hat)) return false
    if (save.credits < price) return false
    const next = { ...save, credits: save.credits - price, hatsOwned: [...save.hatsOwned, hat], hat }
    writeSave(next)
    set({ save: next, revision: get().revision + 1 })
    return true
  },

  resetProgress: () => {
    const save = defaultSave()
    writeSave(save)
    set({ save, result: null, world: null, screen: 'title', revision: get().revision + 1 })
  },
  }))
}

/* Exposed for the console and for the end-to-end tests, which need to read the
   current screen before any Canvas exists to hang a handle off. */
if (typeof window !== 'undefined') {
  const w = window as unknown as { __flesh?: Record<string, unknown> }
  ;(w.__flesh ??= {}).store = useGame
}
