/**
 * GRIT — physical constants.
 *
 * Everything here is in SI units: kilograms, metres, seconds, newtons, radians.
 * Nothing in this file is ever shown to the child as a number; the UI turns all
 * of it into pictures. The grown-up panel's "Show the numbers" toggle is the one
 * exception.
 */

export const G = 9.81

/** How sticky each surface is. This is the table from the brief, unchanged. */
export const MU_SURFACE = {
  dry_tarmac: 1.0,
  wet_tarmac: 0.6,
  gravel: 0.5,
  wet_leaves: 0.35,
  mud: 0.3,
  snow: 0.25,
  ice: 0.15,
} as const

export type SurfaceId = keyof typeof MU_SURFACE

export const SURFACE_IDS = Object.keys(MU_SURFACE) as SurfaceId[]

/**
 * How much of a crate's weight ends up pressing on the driving wheels,
 * depending on where it sits on the bed. This is the whole game.
 */
export const PLACEMENT_FACTOR = {
  over_rear_axle: 0.9,
  middle: 0.5,
  over_cab: 0.15,
} as const

export type Zone = keyof typeof PLACEMENT_FACTOR

export const ZONES: Zone[] = ['over_cab', 'middle', 'over_rear_axle']

/**
 * The mirror of PLACEMENT_FACTOR: how much of a crate presses on the front,
 * which is what the brakes have to work with. Rear-loading buys you go and
 * costs you stop — that tension is the point of level 7.
 */
export const FRONT_FACTOR: Record<Zone, number> = {
  over_rear_axle: 0.1,
  middle: 0.5,
  over_cab: 0.85,
}

/** Empty lorry, and how its own weight is split across the three axles. */
export const LORRY_MASS = 3000
export const LORRY_FRONT_STATIC = 950
export const MID_AXLE_SHARE = 900
export const LORRY_REAR_STATIC = 1150
// 950 + 900 + 1150 = 3000

/** Weight moves about when you accelerate, brake or sit on a slope. */
export const TRANSFER_K = 140

/** Engine pull, and the speed at which it runs out of puff. */
export const MAX_ACCEL = 3.6
export const V_MAX_ENGINE = 16

/** The brakes are a fixed-size hammer. More mass therefore means longer stops. */
export const BRAKE_MAX_FORCE = 30000

/** A sliding wheel is slipperier than a gripping one. */
export const SLIP_MU_FACTOR = 0.6
/** ...and you get grip back by easing off, not by pushing harder. */
export const RECOVER_RATIO = 0.8

/** Kit. Every one of these changes the sums, none is a plain stat boost. */
export const WHEEL_WEIGHTS_KG = 260
export const SAND_BONUS = 1.5
export const SAND_DURATION = 3.5
export const BOARD_MU_MULTIPLIER = 2.4
export const BOARD_LENGTH = 6
export const CHAINS_SPEED_CAP = 0.55
export const BALLAST_MAX = 1200
/** The ballast tank sits low and right over the drive axle. */
export const BALLAST_DRIVE_SHARE = 0.9

/** Rolling drag, per surface — mud and gravel are hard work even when gripping. */
export const ROLLING_RESISTANCE: Record<SurfaceId, number> = {
  dry_tarmac: 0.012,
  wet_tarmac: 0.014,
  gravel: 0.035,
  wet_leaves: 0.02,
  mud: 0.055,
  snow: 0.03,
  ice: 0.01,
}

export const DRAG_K = 3.0

export type TyreId = 'road' | 'knobbly' | 'chains'

/**
 * Tyres are trade-offs, never upgrades. Knobblies bite in mud and gravel and
 * are worse on dry tarmac. Chains are enormous on ice and snow and will not
 * go on tarmac at all (the shop refuses to fit them).
 */
export const TYRE_MULTIPLIER: Record<TyreId, Record<SurfaceId, number>> = {
  road: {
    dry_tarmac: 1.0,
    wet_tarmac: 1.0,
    gravel: 1.0,
    wet_leaves: 1.0,
    mud: 1.0,
    snow: 1.0,
    ice: 1.0,
  },
  knobbly: {
    dry_tarmac: 0.85,
    wet_tarmac: 0.92,
    gravel: 1.35,
    wet_leaves: 1.15,
    mud: 1.6,
    snow: 1.1,
    ice: 1.0,
  },
  chains: {
    dry_tarmac: 0.55,
    wet_tarmac: 0.6,
    gravel: 1.05,
    wet_leaves: 1.1,
    mud: 1.15,
    snow: 2.4,
    ice: 2.8,
  },
}

/** Chains simply will not fit on these. */
export const CHAINS_FORBIDDEN: SurfaceId[] = ['dry_tarmac', 'wet_tarmac']

/**
 * The grip meter needs a fixed yardstick so that "the grit line is low" means
 * the same thing on every level. Roughly: a well-loaded lorry on dry tarmac
 * fills the tread about four fifths of the way up.
 */
export const METER_REFERENCE_FORCE = 22000
