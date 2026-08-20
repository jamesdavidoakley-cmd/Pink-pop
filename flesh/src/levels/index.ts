import type { LevelDef } from './types'

/**
 * Six drives, each teaching one thing, in the order the brief sets out.
 *
 * Routes run roughly along -Z so the default camera looks down the trail.
 * Beacon labels are what the compass reads out, so they earn their keep as
 * flavour: the player spends the whole level staring at them.
 */

const PALETTE = {
  badlands: { sky: '#d9642a', fog: '#c97a4b', ground: '#b98b52', fogDensity: 0.0062 },
  flats: { sky: '#e07a33', fog: '#cf8a55', ground: '#c19a5c', fogDensity: 0.0052 },
  gulch: { sky: '#b8492a', fog: '#a86445', ground: '#a97a4c', fogDensity: 0.0068 },
  tar: { sky: '#c4703a', fog: '#8d7a5e', ground: '#7d6a4a', fogDensity: 0.0088 },
  ash: { sky: '#6b5a52', fog: '#8a7d74', ground: '#8b8074', fogDensity: 0.014 },
  base: { sky: '#c25a2f', fog: '#a86a48', ground: '#b0824f', fogDensity: 0.0072 },
}

export const LEVELS: LevelDef[] = [
  /* ------------------------------------------------------------------ 1 */
  {
    id: 'carver-gates',
    index: 0,
    name: 'CARVER CITY GATES',
    subtitle: 'Six head. Flat country. One rex.',
    brief:
      'Welcome to your first drive, Trail Boss. Six head out of the Carver City pens to the holding beacon. ' +
      'Trans-Time has surveyed the ground and found it agreeable.',
    teaches: 'Move, whoop, goad, shoot, and go fetch your stragglers.',
    par: 360,
    mood: PALETTE.badlands,
    herd: { count: 6, juveniles: 1, styracosaurRatio: 0.5 },
    terrain: {
      seed: 1977,
      amplitude: 3.2,
      featureScale: 70,
      corridorWidth: 40,
      route: [
        { x: 0, z: 0, label: 'CARVER PENS' },
        { x: 14, z: -150, label: 'MARKER ONE' },
        { x: -22, z: -300, label: 'MARKER TWO' },
        { x: 6, z: -450, label: 'HOLDING GATE' },
      ],
      water: [],
      tar: [],
      bounds: { minX: -240, maxX: 240, minZ: -560, maxZ: 110 },
    },
    spawns: [
      // One rex, scripted, once the player has had time to find the controls.
      { at: 78, kind: 'rex', count: 1, mode: 'flank' },
    ],
  },

  /* ------------------------------------------------------------------ 2 */
  {
    id: 'fern-flats',
    index: 1,
    name: 'THE FERN FLATS',
    subtitle: 'Twelve head. Open country. Three rexes on the clock.',
    brief:
      'Twelve head across the Flats. Nothing to hide behind out there — for them or for you. ' +
      'Trans-Time reminds you that a calm herd is a profitable herd.',
    teaches: 'Every second on the rifle is a second the herd is drifting.',
    par: 480,
    mood: PALETTE.flats,
    herd: { count: 12, juveniles: 2, styracosaurRatio: 0.5 },
    terrain: {
      seed: 2024,
      amplitude: 4.4,
      featureScale: 84,
      corridorWidth: 46,
      route: [
        { x: 0, z: 0, label: 'FLATS PEN' },
        { x: 62, z: -160, label: 'FERN MARKER' },
        { x: 18, z: -330, label: 'DRY WASH' },
        { x: -74, z: -480, label: 'STONE MARKER' },
        { x: -6, z: -640, label: 'TRANS-TIME GATE' },
      ],
      water: [],
      tar: [],
      bounds: { minX: -300, maxX: 300, minZ: -760, maxZ: 120 },
    },
    spawns: [
      { at: 55, kind: 'rex', count: 1, mode: 'flank' },
      { at: 150, kind: 'rex', count: 2, mode: 'behind' },
      { at: 265, kind: 'rex', count: 2, mode: 'ahead' },
    ],
  },

  /* ------------------------------------------------------------------ 3 */
  {
    id: 'bone-gulch',
    index: 2,
    name: 'BONE GULCH',
    subtitle: 'A narrow shelf and a long drop.',
    brief:
      'The shelf road through Bone Gulch. Drop on your right the whole way. ' +
      'Trans-Time has costed the recovery of fallen stock and advises against it.',
    teaches: 'Steer a stampede. The edge does not forgive.',
    par: 480,
    mood: PALETTE.gulch,
    herd: { count: 12, juveniles: 2, styracosaurRatio: 0.6 },
    scriptedStampede: { atProgress: 0.5 },
    terrain: {
      seed: 3131,
      amplitude: 7.5,
      featureScale: 62,
      corridorWidth: 26,
      route: [
        { x: 0, z: 0, label: 'GULCH HEAD' },
        { x: 34, z: -140, label: 'THE NARROWS' },
        { x: 20, z: -300, label: 'THE ELBOW' },
        { x: -30, z: -450, label: 'SHELF END' },
        { x: -10, z: -590, label: 'TRANS-TIME GATE' },
      ],
      water: [],
      tar: [],
      gulch: { side: 1, offset: 17, depth: 58, from: 0.16, to: 0.84 },
      bounds: { minX: -240, maxX: 240, minZ: -700, maxZ: 110 },
    },
    spawns: [
      { at: 60, kind: 'rex', count: 1, mode: 'behind' },
      { at: -1, kind: 'raptor', count: 5, mode: 'flank', triggerProgress: 0.62 },
      { at: 300, kind: 'rex', count: 1, mode: 'ahead' },
    ],
  },

  /* ------------------------------------------------------------------ 4 */
  {
    id: 'tar-shallows',
    index: 3,
    name: 'THE TAR SHALLOWS',
    subtitle: 'Slow ground, standing water, and something in it.',
    brief:
      'Tar seeps and shallow water. Stock bogs down, so keep them moving. ' +
      'Survey notes an unconfirmed large aquatic. Trans-Time considers the report unverified.',
    teaches: 'Find the ford. Read the rhythm. Do not fight the water.',
    par: 540,
    mood: PALETTE.tar,
    boss: 'bighungry',
    herd: { count: 12, juveniles: 3, styracosaurRatio: 0.45 },
    terrain: {
      seed: 4242,
      amplitude: 3.0,
      featureScale: 76,
      corridorWidth: 40,
      route: [
        { x: 0, z: 0, label: 'SEEP CAMP' },
        { x: 40, z: -150, label: 'TAR MARKER' },
        { x: 10, z: -300, label: 'THE CROSSING' },
        { x: -40, z: -450, label: 'FAR BANK' },
        { x: 0, z: -600, label: 'TRANS-TIME GATE' },
      ],
      water: [
        { x: 10, z: -300, radius: 78, depth: 4.4, ford: { x: 44, z: -292, width: 34 } },
      ],
      tar: [
        { x: 44, z: -120, radius: 34 },
        { x: -18, z: -196, radius: 28 },
        { x: -52, z: -420, radius: 32 },
      ],
      bounds: { minX: -270, maxX: 270, minZ: -710, maxZ: 110 },
    },
    spawns: [
      { at: 50, kind: 'rex', count: 1, mode: 'behind' },
      { at: -1, kind: 'phobosuchus', count: 2, mode: 'absolute', x: 10, z: -300, triggerProgress: 0.38 },
      { at: -1, kind: 'bighungry', count: 1, mode: 'absolute', x: 4, z: -306, triggerProgress: 0.44 },
    ],
  },

  /* ------------------------------------------------------------------ 5 */
  {
    id: 'ash-plains',
    index: 4,
    name: 'THE ASH PLAINS',
    subtitle: 'Low cloud, lightning, and things above and below.',
    brief:
      'Ashfall from the northern vents. Visibility poor, storm cells active. ' +
      'Trans-Time has elected not to reschedule the drive.',
    teaches: 'Look up. Then look down. Deal with the panic-dealers first.',
    par: 600,
    mood: PALETTE.ash,
    storm: { interval: 11, visibility: 0.5 },
    herd: { count: 12, juveniles: 3, styracosaurRatio: 0.5 },
    terrain: {
      seed: 5150,
      amplitude: 5.6,
      featureScale: 68,
      corridorWidth: 38,
      route: [
        { x: 0, z: 0, label: 'ASH CAMP' },
        { x: -46, z: -155, label: 'VENT MARKER' },
        { x: 30, z: -310, label: 'THE PALE ROCKS' },
        { x: -20, z: -465, label: 'CINDER MARKER' },
        { x: 20, z: -620, label: 'TRANS-TIME GATE' },
      ],
      water: [],
      tar: [{ x: -30, z: -240, radius: 26 }],
      bounds: { minX: -280, maxX: 280, minZ: -740, maxZ: 120 },
    },
    spawns: [
      { at: 40, kind: 'raptor', count: 5, mode: 'flank' },
      { at: 105, kind: 'pteranodon', count: 2, mode: 'ahead' },
      { at: 190, kind: 'rex', count: 2, mode: 'behind' },
      { at: 265, kind: 'raptor', count: 5, mode: 'ahead' },
      { at: 350, kind: 'pteranodon', count: 3, mode: 'flank' },
    ],
  },

  /* ------------------------------------------------------------------ 6 */
  {
    id: 'base-3',
    index: 5,
    name: 'BASE 3 APPROACH',
    subtitle: 'The laser fence is in sight. So is she.',
    brief:
      'Final leg to Trans-Time Base 3. Be advised: the one-eyed female is in the area and has been ' +
      'in the area for some years. Trans-Time wishes you a productive delivery.',
    teaches: 'She is old, she is patient, and she cannot see out of her left eye.',
    par: 600,
    mood: PALETTE.base,
    boss: 'oldoneeye',
    herd: { count: 12, juveniles: 2, styracosaurRatio: 0.5 },
    terrain: {
      seed: 6666,
      amplitude: 4.8,
      featureScale: 74,
      corridorWidth: 42,
      route: [
        { x: 0, z: 0, label: 'LAST CAMP' },
        { x: 44, z: -160, label: 'FENCE MARKER' },
        { x: -30, z: -320, label: 'THE APRON' },
        { x: 0, z: -470, label: 'BASE 3 GATE' },
      ],
      water: [],
      tar: [],
      bounds: { minX: -280, maxX: 280, minZ: -600, maxZ: 120 },
    },
    spawns: [
      { at: 45, kind: 'rex', count: 1, mode: 'flank' },
      { at: -1, kind: 'oldoneeye', count: 1, mode: 'ahead', triggerProgress: 0.34 },
      { at: 240, kind: 'raptor', count: 5, mode: 'behind' },
    ],
  },
]

export const levelById = (id: string): LevelDef | undefined => LEVELS.find((l) => l.id === id)

/** Shown on the loading screen. Dry cowboy, cheerful corporation. */
export const LOADING_TIPS: string[] = [
  'A calm herd is a profitable herd. Trans-Time thanks you.',
  'Reagan says: never turn your back on the treeline.',
  'Push the matriarch. The rest are only following her anyway.',
  'The rifle does not solve anything. It only buys you eight seconds.',
  'Trans-Time reminds all personnel that stock is not to be named.',
  'Reagan says: the goad is quiet. The rifle is not.',
  'A straggler is an animal that has stopped believing in the herd.',
  'Trans-Time values your safety second only to the delivery schedule.',
  'Reagan says: if you are shooting from inside the herd, you have already lost.',
  'Whoop early. Whoop often. Eight seconds is a long time out here.',
  'Twenty rangers and six head lost. Acceptable. — Controller, Trans-Time Base 3',
  'Reagan says: a rex will always take the one that wandered off.',
  'Trans-Time: sixty-five million years of customer focus.',
  'Reagan says: you cannot outrun weather and you cannot outrun a stampede.',
  'Juveniles spook first and run furthest. Keep them in the middle.',
  'Trans-Time operates a strict no-kill policy in the field. Stun and move on.',
]
