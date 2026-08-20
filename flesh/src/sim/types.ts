import type { Rng, V3 } from '@/core/math'
import type { Terrain } from '@/world/terrain'
import type { LevelDef } from '@/levels/types'
import type { DifficultyTuning } from '@/state/difficulty'

/* --------------------------------------------------------------- The herd */

/** Per-animal state. STAMPEDING is a *herd-level* read-out of enough PANICKED. */
export type HerdState = 'GRAZING' | 'MOVING' | 'SKITTISH' | 'PANICKED'

/** What the HUD bar shows for the herd as a whole. */
export type HerdMood = 'GRAZING' | 'MOVING' | 'SKITTISH' | 'STAMPEDING'

export type HerdKind = 'triceratops' | 'styracosaur'

export interface HerdAnimal {
  id: number
  kind: HerdKind
  juvenile: boolean
  matriarch: boolean
  pos: V3
  vel: V3
  /** Facing, radians. Lags velocity, which is what gives the waddle its weight. */
  heading: number
  calm: number
  state: HerdState
  panicTimer: number
  /** Direction locked in at the moment of bolting — panic is a straight line. */
  panicDir: V3
  straggler: boolean
  /** Left the drive: over the edge, out of bounds, or dragged off by a rex. */
  lost: boolean
  delivered: boolean
  /** Set while a predator has hold of it. */
  grabbedBy: number | null
  /** Drives the leg animation and the footfall dust, in the renderer only. */
  gait: number
  /** Where this animal wandered to graze, so grazing does not look like jitter. */
  grazeTarget: V3
  grazeRetarget: number
  /** Countdown on the whoop's pull. */
  whoopTimer: number
  /**
   * Momentum. Once an animal has decided to travel it keeps travelling for a
   * couple of seconds after the reason goes away, so the herd flows instead of
   * stuttering to a halt every time the trail boss drops back a few metres.
   */
  moveHold: number
  scale: number
  /** Smoothed speed, so the renderer can pick a gait without stutter. */
  speedSmoothed: number
}

/* ---------------------------------------------------------------- Threats */

export type PredatorKind =
  | 'rex'
  | 'raptor'
  | 'pteranodon'
  | 'phobosuchus'
  | 'bighungry'
  | 'oldoneeye'

export type PredatorState =
  | 'HIDDEN' // spawned but not yet revealed (phobosuchus, ambushes)
  | 'STALK' // moving up under cover, picking a target
  | 'APPROACH'
  | 'TELEGRAPH' // the wind-up roar
  | 'LUNGE'
  | 'GRAB' // dragging an animal away
  | 'STAGGERED'
  | 'ROOTED' // net gun
  | 'DOWN' // stunned asleep
  | 'FLEE'
  | 'SUBMERGED' // Big Hungry's rhythm
  | 'RISING'
  | 'RECOVER'

export interface Predator {
  id: number
  kind: PredatorKind
  pos: V3
  vel: V3
  heading: number
  state: PredatorState
  stateTimer: number
  /** Herd animal id, or -1 for "coming for Reagan". */
  targetId: number
  /** Stun hits landed inside the combo window. */
  hits: number
  hitWindow: number
  radius: number
  scale: number
  /** Boss bookkeeping. */
  staggers: number
  neckHits: number
  /** Old One Eye turns toward the last noise she heard. */
  lastSoundAt: V3 | null
  lastSoundTimer: number
  /**
   * Seconds left backing off after a goad. The goad has to buy more than the
   * 1.1s of stagger or it is strictly worse than the rifle, and the brief is
   * explicit that a skilled player should be able to push a rex off the herd
   * without ever firing.
   */
  spooked: number
  /** Set once a drone has painted it. */
  marked: boolean
  alive: boolean
  /** Seconds since it arrived. Past its patience it breaks off and leaves. */
  age: number
  /** Pteranodons cruise, dive, and climb again. */
  altitude: number
  repath: number
  /** Home point, used to keep ambushers in their water. */
  anchor: V3
  gait: number
}

/* ---------------------------------------------------------------- Reagan */

export interface Player {
  pos: V3
  vel: V3
  /** Body facing. Chases the movement direction with a deliberate lag. */
  heading: number
  /** Where he is looking — set by the camera, used for the hitscan. */
  aimYaw: number
  aimPitch: number
  grounded: boolean
  coyote: number
  jumpBuffered: number
  jumpHeld: boolean
  stamina: number
  staminaHold: number
  sprinting: boolean
  aiming: boolean
  ammo: number
  rechargeTimer: number
  /**
   * Seconds since the last shot, counting down. While it is running Reagan
   * stops being a calming presence — a man working a stun rifle is not
   * reassuring anybody, and without this the aura simply out-restores the
   * gunfire penalty and standing still shooting becomes the optimal play.
   */
  gunHeat: number
  fireTimer: number
  goadTimer: number
  whoopTimer: number
  whoopActive: number
  netTimer: number
  boomerTimer: number
  onBike: boolean
  bikeSpeed: number
  mountTimer: number
}

/* ------------------------------------------------------------------ Input */

/** One frame of intent. The renderer builds it; the tests fabricate it. */
export interface InputFrame {
  /** Desired move direction in world space, already camera-relative. Unit-ish. */
  moveX: number
  moveZ: number
  sprint: boolean
  jump: boolean
  jumpHeld: boolean
  aim: boolean
  /** Edge-triggered: true only on the frame the button went down. */
  fire: boolean
  goad: boolean
  whoop: boolean
  mount: boolean
  net: boolean
  boomer: boolean
  /** Where the rifle is pointed. Unit vector, world space. */
  aimYaw: number
  aimPitch: number
}

export const NO_INPUT: InputFrame = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  jump: false,
  jumpHeld: false,
  aim: false,
  fire: false,
  goad: false,
  whoop: false,
  mount: false,
  net: false,
  boomer: false,
  aimYaw: 0,
  aimPitch: 0,
}

/* ----------------------------------------------------------------- Events */

/** Things worth a noise, a puff of dust or a line of HUD text. */
export type SimEvent =
  | { t: 'shot'; from: V3; to: V3; hit: boolean }
  | { t: 'hit'; at: V3; predator: number; headshot: boolean }
  | { t: 'predator_down'; at: V3; kind: PredatorKind }
  | { t: 'predator_stagger'; at: V3; kind: PredatorKind }
  | { t: 'roar'; at: V3; kind: PredatorKind }
  | { t: 'goad'; at: V3; connected: boolean }
  | { t: 'whoop'; at: V3 }
  | { t: 'net'; at: V3; hit: boolean }
  | { t: 'boomer'; at: V3 }
  | { t: 'grab'; at: V3; animal: number }
  | { t: 'freed'; at: V3; animal: number }
  | { t: 'head_lost'; at: V3; animal: number; reason: 'taken' | 'strayed' | 'fell' }
  | { t: 'head_delivered'; animal: number; prime: boolean; index: number }
  | { t: 'beacon'; index: number }
  | { t: 'stampede' }
  | { t: 'calm_restored' }
  | { t: 'thunder' }
  | { t: 'jump' }
  | { t: 'land'; hard: boolean }
  | { t: 'mount'; on: boolean }
  | { t: 'boss_stagger'; at: V3; remaining: number }
  | { t: 'boss_down'; at: V3 }
  | { t: 'complete' }
  | { t: 'failed' }
  | { t: 'toast'; text: string }

/* ------------------------------------------------------------------ World */

export interface RunStats {
  headStart: number
  headDelivered: number
  headLost: number
  headPrime: number
  shotsFired: number
  stragglersLost: number
  timeElapsed: number
  creditsEarned: number
}

export interface SpawnTicket {
  /** Seconds into the level, or -1 for a trigger-based ambush. */
  at: number
  kind: PredatorKind
  count: number
  /** Spawn position: offset relative to the herd centroid, or absolute. */
  mode: 'ahead' | 'behind' | 'flank' | 'absolute'
  x?: number
  z?: number
  /** Fires once the herd passes this route progress (0..1) instead of on a timer. */
  triggerProgress?: number
  fired?: boolean
}

export interface World {
  time: number
  level: LevelDef
  terrain: Terrain
  difficulty: DifficultyTuning
  rng: Rng
  player: Player
  herd: HerdAnimal[]
  predators: Predator[]
  /** Index into level.route of the beacon currently being driven to. */
  beaconIndex: number
  spawns: SpawnTicket[]
  events: SimEvent[]
  phase: 'playing' | 'complete' | 'failed'
  stats: RunStats
  /** Herd-wide read-out, recomputed each tick for the HUD. */
  mood: HerdMood
  herdCentroid: V3
  herdCalmAverage: number
  /** Ash Plains lightning. */
  stormTimer: number
  stormFlash: number
  /** Where the hover bike is parked. It stays where you left it. */
  bikePos: V3
  /** Set by the drone upgrade. */
  droneActive: boolean
  upgrades: ActiveUpgrades
  /** Ticks up while the herd is stampeding, for the klaxon and the tests. */
  stampedeTimer: number
  /** Scripted one-shots the level has already played. */
  scriptFlags: Record<string, boolean>
  /** How long the player has stood at the gate closing the drive out. */
  closeoutTimer: number
  nextId: number
  /** Screen shake impulse the renderer drains. */
  shake: number
}

export interface ActiveUpgrades {
  netGun: boolean
  sonicBoomer: boolean
  drone: boolean
  herdCalmer: boolean
  staminaLevel: number
  rechargeLevel: number
  bikeLevel: number
}

export const NO_UPGRADES: ActiveUpgrades = {
  netGun: false,
  sonicBoomer: false,
  drone: false,
  herdCalmer: false,
  staminaLevel: 0,
  rechargeLevel: 0,
  bikeLevel: 0,
}
