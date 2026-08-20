/**
 * The palette.
 *
 * Burnt orange sky, dusty ochre ground, deep teal shadows, acid green ferns —
 * and Trans-Time's corporate colours as the only clean saturated blocks in the
 * world. The corporate cleanliness is meant to look wrong against the
 * landscape. That is the point of the whole strip, so nothing else in the world
 * is allowed to be that clean.
 */

export const PALETTE = {
  /* --------------------------------------------------------- the world */
  skyHigh: '#a83c1e',
  skyLow: '#e8933c',
  sun: '#ffd9a0',
  groundLight: '#c99a5e',
  groundMid: '#b1834c',
  groundDark: '#8d6238',
  /** Shadows are teal, not black. Nothing in this world is neutral. */
  shadow: '#1d4a4a',
  shadowSoft: '#2f5f5c',
  rock: '#9a7550',
  rockDark: '#6f5238',
  fern: '#7fbf3f',
  fernDark: '#4e8a2a',
  tar: '#2b2620',
  water: '#4e7a6e',
  ash: '#8d8378',

  /* ------------------------------------------------------- Trans-Time */
  /** Clean, flat, and entirely out of place. */
  corpWhite: '#f2f4f6',
  corpBlue: '#1b4fd8',
  corpYellow: '#ffd21f',
  corpRed: '#e02020',

  /* ---------------------------------------------------------- animals */
  triceratops: '#a8724a',
  triceratopsFrill: '#d9a468',
  styracosaur: '#8f6a52',
  styracosaurFrill: '#c19a74',
  juvenile: '#c39468',
  horn: '#e8dcc0',
  rex: '#6f7a4a',
  rexBelly: '#b6ab7c',
  rexDark: '#4e5734',
  raptor: '#a8553a',
  raptorStripe: '#5e2f22',
  pteranodon: '#8a7f9a',
  croc: '#4a5a44',
  nothosaur: '#4f6b74',
  nothosaurBelly: '#9fb0a6',
  oldOneEye: '#5c5442',
  oldOneEyeScar: '#8b8570',
  deadEye: '#e8e4d8',

  /* ----------------------------------------------------------- Reagan */
  coat: '#7a4a2e',
  coatDark: '#5a3520',
  hat: '#3f2b1c',
  shirt: '#c8b48a',
  skin: '#c98f63',
  denim: '#3a4a68',
  boot: '#4a3524',
  goadPole: '#8a6a44',
  goadTip: '#ffd21f',
  stunBeam: '#7fe8ff',
} as const

export type PaletteKey = keyof typeof PALETTE

/**
 * Deterministic per-individual colour variation.
 *
 * Twelve animals sharing one hex value read as twelve copies of one animal, and
 * the herd stops looking like a herd. A small hue and lightness jitter keyed off
 * the animal's id fixes that for nothing — the toon material caches per colour,
 * so a dozen shades cost a dozen cached materials and not one extra draw call
 * beyond what each mesh already needed.
 *
 * Kept deliberately narrow. Wide enough and they stop reading as one species.
 */
export function varyColour(hex: string, seed: number, hue = 0.022, light = 0.09): string {
  const h = (Math.imul(seed | 0, 0x9e3779b9) >>> 0) / 4294967296
  const g = (Math.imul((seed + 977) | 0, 0x85ebca6b) >>> 0) / 4294967296

  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const gr = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255

  const max = Math.max(r, gr, b)
  const min = Math.min(r, gr, b)
  let hh = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) hh = ((gr - b) / d) % 6
    else if (max === gr) hh = (b - r) / d + 2
    else hh = (r - gr) / d + 4
    hh /= 6
    if (hh < 0) hh += 1
  }

  const nh = (hh + (h - 0.5) * hue * 2 + 1) % 1
  const nl = Math.max(0.06, Math.min(0.94, l + (g - 0.5) * light * 2))

  const c = (1 - Math.abs(2 * nl - 1)) * s
  const x = c * (1 - Math.abs(((nh * 6) % 2) - 1))
  const m = nl - c / 2
  const seg = Math.floor(nh * 6) % 6
  const rgb =
    seg === 0 ? [c, x, 0] : seg === 1 ? [x, c, 0] : seg === 2 ? [0, c, x]
      : seg === 3 ? [0, x, c] : seg === 4 ? [x, 0, c] : [c, 0, x]
  const out = rgb.map((v) => Math.round((v + m) * 255))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Herd-state colours, matching the HUD bar to the animals in §6. */
export const MOOD_COLOUR = {
  GRAZING: '#7fbf3f',
  MOVING: '#f2f4f6',
  SKITTISH: '#ffb020',
  STAMPEDING: '#e02020',
} as const
