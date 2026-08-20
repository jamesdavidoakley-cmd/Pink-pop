/**
 * Every number the design brief pins down, in one place.
 *
 * The rule for this file: if a playtest wants a value changed, it should be
 * changed *here*, not in the middle of a steering loop. Anything with a figure
 * quoted in the design doc keeps that figure and cites it in a comment.
 */

/* ------------------------------------------------------------------ Reagan */

export const PLAYER = {
  walkSpeed: 6.2,
  sprintSpeed: 10.5,
  aimSpeedScale: 0.42, // "Movement speed drops while aiming."
  /** Reach full speed in ~0.3s — the Mario 64 weight the brief asks for. */
  accel: 6.2 / 0.3,
  /** Deliberately lower than accel: that difference is the skid. */
  decel: 6.2 / 0.16,
  /** How fast the body yaw chases the movement direction. Low = visible skid. */
  turnRate: 8.5,
  /** "a satisfying double-height jump" — ~2.4m apex, roughly twice honest. */
  jumpSpeed: 8.6,
  gravity: -22,
  /** Releasing jump early cuts the arc, so height is expressive. */
  jumpCutMultiplier: 0.45,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  /** Step height Reagan clears without jumping, i.e. the vault. */
  vaultHeight: 0.85,
  radius: 0.45,
  height: 1.8,
  stamina: { max: 100, drain: 22, regen: 16, regenDelay: 0.7 },
  eyeHeight: 1.5,
} as const

/* ------------------------------------------------------------------- Herd */

export const HERD = {
  /** Boid weights, exactly as specified in the brief §6. */
  weights: {
    separation: 1.5,
    cohesion: 1.0,
    alignment: 0.8,
    repulsionPlayer: 2.0,
    repulsionPredator: 4.0,
    grazeAttraction: 0.5,
    obstacleAvoidance: 3.0,
    /** The leader trick: followers weight the matriarch over the centroid. */
    cohesionMatriarch: 2.5,
  },
  radii: {
    separation: 4.2,
    cohesion: 22,
    alignment: 14,
    player: 8, // "repulsion from Reagan (weight 2.0, radius 8m)"
    predator: 25, // "repulsion from predators (weight 4.0, radius 25m)"
    graze: 18,
    obstacle: 6,
  },
  speed: {
    graze: 1.1,
    move: 4.4,
    skittish: 5.2,
    /** "bolts in a straight line ... at double speed" */
    panic: 8.8,
    juvenileScale: 1.08,
    matriarchScale: 0.94, // she sets a steady pace; the herd is faster and catches up
  },
  accel: 7.0,
  turnRate: 3.2,
  radius: 2.0,
  juvenileScale: 0.6, // "a few juveniles at 60% scale"

  calm: {
    max: 100,
    /** Below this an animal bolts. */
    panicThreshold: 25,
    /** Above this at delivery it pays the prime-condition bonus. */
    primeThreshold: 75,
    panicDuration: 5, // "for 5 seconds"
    /** Drain per second at zero distance from a predator, falling off to 0 at radius. */
    predatorDrain: 26,
    predatorRadius: 25,
    /** "An animal within 10m of a panicked animal loses 10 calm per second." */
    contagionDrain: 10,
    contagionRadius: 10,
    /** "Shooting anywhere near the herd costs every animal within 15m five calm" */
    gunshotCost: 5,
    gunshotRadius: 15,
    /** Thunder in the Ash Plains, applied herd-wide on each flash. */
    thunderCost: 12,
    cliffDrain: 18,
    cliffRadius: 5,
    /** Restored per second by a calm Reagan standing close. */
    reaganRestore: 4.5,
    /** How long after a shot Reagan stops counting as a calming presence. */
    gunHeatSeconds: 2.6,
    reaganRadius: 12,
    /** A sprinting trail boss is not a reassuring one. */
    reaganSprintScale: 0.15,
    whoopRestore: 15, // "The whoop call restores 15 instantly."
    /**
     * Passive drift back up when nothing at all is wrong. Only applies with no
     * threat inside twenty-five metres, so it does not soften a live level —
     * but it decides how long the herd stays jumpy after a stampede is over,
     * and too slow a value makes recovery feel like a punishment rather than a
     * skill.
     */
    idleRestore: 3.5,
    juvenileDrainScale: 1.6, // "juveniles ... panic faster"
  },

  /** "more than 40m from the matriarch is flagged STRAGGLER" (Trail Boss). */
  stragglerLeash: 40,
  /** A straggler this far from the matriarch when a beacon is reached is lost. */
  stragglerGraceOnBeacon: 0,
  skittishCalm: 55, // heads-up, stamping, amber bar
  grazeIdleSpeed: 0.35,
} as const

/* -------------------------------------------------------------- The whoop */

export const WHOOP = {
  radius: 25, // "herd animals within 25 metres steer toward you"
  duration: 4, // "for 4 seconds"
  cooldown: 8, // "8 second cooldown"
  /** Steering weight applied to whooped animals; must beat predator repulsion. */
  weight: 5.0,
} as const

/* ----------------------------------------------------------------- Weapons */

export const RIFLE = {
  magazine: 8,
  /** "recharges 1 round per 1.5s when not firing" */
  rechargeSeconds: 1.5,
  rechargeDelay: 0.6,
  fireInterval: 0.28,
  range: 90,
  /** Aim cone when hip-firing; zero when aiming down sights. */
  hipSpread: 0.055,
  /** Three hits inside this window drop a rex. */
  comboWindow: 5,
  hitsToDrop: 3,
  downDuration: 10, // "asleep for 10s"
  staggerDuration: 0.9,
  headshotMultiplier: 2, // "Headshots count double."
} as const

export const GOAD = {
  range: 3, // "knocks back anything within 3 metres"
  arc: Math.PI * 0.55, // "a wide arc"
  cooldown: 0.55,
  /** "knocks a rex back 6m" */
  knockbackPredator: 6,
  knockbackHerd: 3.2,
  /** A goaded herd animal is nudged, not terrified. */
  herdCalmCost: 2,
  staggerDuration: 1.1,
} as const

export const NET_GUN = {
  rootDuration: 12, // "roots a rex in place for 12s"
  cooldown: 40, // "40s cooldown"
  range: 45,
} as const

export const SONIC_BOOMER = {
  radius: 12, // "shoves everything within 12m outward"
  push: 11,
  cooldown: 26,
  /** "also panics your own herd, so it is a panic button with a real cost" */
  herdCalmCost: 30,
} as const

export const DRONE = {
  /** "marks predators through terrain on the minimap 10s before they attack" */
  foresight: 10,
  orbitRadius: 7,
  orbitHeight: 9,
} as const

/* ---------------------------------------------------------------- Predators */

export const REX = {
  speed: 8.6,
  chargeSpeed: 12.4,
  turnRate: 2.1,
  radius: 2.4,
  /** "Wind-up roar telegraph of 1.2s before a lunge." */
  telegraph: 1.2,
  lungeRange: 7.5,
  lungeDuration: 0.65,
  /** "grabs it and drags it away over 4 seconds" */
  dragDuration: 4,
  dragSpeed: 7.2,
  /** Where the rex is trying to drag the animal to: off the map. */
  fleeDistance: 120,
  approachStandoff: 3.0,
  repathInterval: 0.9,
  /** Rexes prefer stragglers; this is how much closer a non-straggler must be. */
  stragglerBias: 45,
  headHeight: 4.6,
} as const

export const RAPTOR = {
  speed: 12.2,
  turnRate: 4.4,
  radius: 0.9,
  packSize: 5, // "comes in fives"
  telegraph: 0.45,
  hitsToDrop: 1,
  /** Small body, enormous nuisance value. */
  panicAuraRadius: 18,
  panicAuraDrain: 22,
  harassRadius: 9,
  headHeight: 1.6,
} as const

export const PTERANODON = {
  speed: 15,
  turnRate: 2.6,
  radius: 1.1,
  cruiseHeight: 22,
  diveSpeed: 26,
  telegraph: 0.9,
  hitsToDrop: 2,
  goadable: false, // "Cannot be goaded."
  headHeight: 1.2,
} as const

export const PHOBOSUCHUS = {
  speed: 7.4,
  turnRate: 2.8,
  radius: 1.6,
  /** "Invisible until the herd enters the water." */
  revealRadius: 14,
  telegraph: 0.7,
  hitsToDrop: 2,
  dragDuration: 3,
  headHeight: 0.7,
} as const

/* ------------------------------------------------------------------ Bosses */

export const BIG_HUNGRY = {
  radius: 4.5,
  /** The rhythm you read and cross between. */
  submergedTime: 3.4,
  risingTime: 0.8,
  telegraph: 1.0,
  lungeTime: 1.1,
  recoverTime: 2.2,
  lungeReach: 22,
  hitsToStagger: 3,
  staggersToWin: 3,
  headHeight: 5.5,
} as const

export const OLD_ONE_EYE = {
  scale: 1.5, // "half again the size of a normal rex"
  speed: 7.8,
  turnRate: 1.15,
  radius: 3.6,
  /** "cannot see anything in a 90-degree cone on her blind left side" */
  blindConeHalfAngle: Math.PI / 4,
  blindSideSign: 1, // +1 = her left in local space
  telegraph: 1.5,
  lungeRange: 9,
  dragDuration: 4.5,
  /** Sound draws her: firing the rifle rotates her toward the shot. */
  soundTurnBoost: 2.4,
  soundMemory: 2.5,
  staggerDuration: 3.2,
  neckHitsPerStagger: 3, // "land three rifle shots to the exposed neck"
  staggersToDown: 3, // "Three staggers and she goes down"
  headHeight: 6.6,
} as const

/* -------------------------------------------------------------- Hover bike */

export const BIKE = {
  topSpeed: 19,
  accel: 11,
  brake: 16,
  turnRate: 2.3,
  hoverHeight: 1.35,
  /** Riding scares the herd — the bike is for stragglers, not for driving. */
  herdFearScale: 1.9,
  mountRange: 4,
} as const

/* ------------------------------------------------------------------ Economy */

export const CREDITS = {
  perHead: 100, // "100 per head delivered"
  primeBonus: 50, // "50 bonus per head that finishes at over 75 calm"
  noStragglersLost: 200, // "200 for zero stragglers lost"
  pacifist: 300, // "300 for a level completed without firing the rifle at all"
} as const

/** "delivering fewer than four head" is the fail state. */
export const MIN_HEAD_TO_PASS = 4

/* ------------------------------------------------------------------- World */

export const WORLD = {
  beaconRadius: 14,
  gateRadius: 16,
  /** A head is only counted through a beacon if it is inside this of it. */
  beaconHerdRadius: 34,
  maxAgents: 40, // "Max 40 active AI agents."
  fixedStep: 1 / 60,
  maxStepsPerFrame: 4,
} as const
