/**
 * Every scoring weight, timing and feel constant in the game lives here.
 * Nothing else in the codebase should hard-code a number you would want to
 * argue about. Retune here first; add features second.
 */
export const TUNING = {
  /** Logical canvas. Everything is drawn at this size and scaled to fit. */
  view: {
    width: 960,
    height: 600,
    topdownFrac: 0.6,
    padding: 14,
  },

  /** The camera in the player's hands. One lens. No zoom. Position is the zoom. */
  camera: {
    fovH: (42 * Math.PI) / 180,
    eyeStanding: 1.55,
    eyeCrouched: 0.86,
    /** Portrait frame, 2:3. */
    frameAspect: 2 / 3,
    /** Where the horizon sits inside the frame, 0 = top, 1 = bottom. */
    horizonFrac: 0.44,
    nearPlane: 0.35,
  },

  player: {
    speedWalk: 3.1,
    speedSlow: 1.25,
    speedCrouch: 1.15,
    /** Multiplier while the camera is raised to the eye. */
    raisedMul: 0.42,
    accel: 22,
    radius: 0.3,
    /** Burst rate while the shutter is held, frames per second. */
    burstFps: 5,
  },

  /** How visible you are. This is the invisibility lesson, expressed as numbers. */
  awareness: {
    nearRadius: 2.5,
    facingCone: (120 * Math.PI) / 180,
    nearRise: 0.62,
    eyelineRadius: 6,
    stillSeconds: 2,
    stillRise: 0.26,
    motionRadius: 5,
    motionRise: 0.34,
    crouchMul: 0.3,
    slowMul: 0.45,
    raisedMul: 1.2,
    decay: 0.32,
    /** Above this a guest turns to the lens and the moment dies. */
    posedAt: 0.6,
    /** Per second, to every guest in the room, while you stand somewhere you shouldn't. */
    forbiddenRise: 0.75,
  },

  /** Moment lifecycle, in seconds, and what each phase is worth. */
  moment: {
    tell: 1.5,
    build: 2.0,
    peak: 0.6,
    decay: 1.5,
    mult: { dormant: 0, tell: 0.3, build: 0.6, peak: 1.0, decay: 0.5, gone: 0 },
    /** Intrinsic worth of the moment itself. */
    valueMinor: 0.75,
    valueMustGet: 1.0,
  },

  /** score = phase * posed * weighted sum of these, x100. */
  score: {
    weights: {
      moment: 0.3,
      framing: 0.2,
      clarity: 0.2,
      light: 0.15,
      angle: 0.1,
      layers: 0.05,
    },
    posedPenalty: 0.3,
    /** Subject height as a fraction of the frame. Inside this band is right. */
    sizeIdeal: [0.3, 0.68] as [number, number],
    sizeFalloff: 0.3,
    /** Horizontal placement, 0 = dead centre, 1 = frame edge. */
    placementSweet: 0.55,
    /** How hard a nearer body across your subject hurts. */
    occlusionBite: 1.5,
    lightFloor: 0.22,
    angleBase: 0.35,
    angleGain: 1.6,
    /** A foreground body must sit between these fractions of the subject distance. */
    layerBand: [0.25, 0.72] as [number, number],
    /** A "wide" beat wants this many bodies in frame and a small subject. */
    wideBodies: 6,
    wideSubjectMax: 0.42,
    /** At or above this, a must-get beat counts as covered. */
    beatHitScore: 40,
    /** At or above this, a frame is a keeper. */
    keeperScore: 60,
    /** Cost to the final grade for each must-get beat you missed. */
    missedBeatPenalty: 15,
    /** The day is graded on your best this many frames, zero-padded. */
    gradeTopN: 12,
  },

  /** Room feel. */
  render: {
    guestSway: 0.55,
    tellLead: 1.5,
    confettiGravity: 1.6,
  },
} as const;

export type Tuning = typeof TUNING;
