// Every level is data. Coordinates are grid cells; y grows downward; the world is 24 × 14.
import type { ToolKind } from './parts';

export type ModeId = 'bridge' | 'wobble' | 'stand' | 'lift' | 'roof';
export type Tier = 1 | 2 | 3;
export const MODES: ModeId[] = ['bridge', 'wobble', 'stand', 'lift', 'roof'];
export const TIERS: Tier[] = [1, 2, 3];
export const WORLD_W = 24;
export const WORLD_H = 14;

export const MODE_INFO: Record<ModeId, { title: string; icon: string; blurb: string; lesson: string }> = {
  bridge: { title: 'Cross the Gap', icon: '🌉', blurb: 'Build a bridge the cart can cross.', lesson: 'Long beams sag. Hold the middle up, or make triangles.' },
  wobble: { title: "Don't Wobble", icon: '🐐', blurb: 'Build a gate that survives a charging goat.', lesson: 'Squares wobble. Triangles don’t.' },
  stand: { title: 'Stand Up', icon: '🏗️', blurb: 'Stack blocks to the star and survive the earthquake.', lesson: 'Wide at the bottom, heavy at the bottom.' },
  lift: { title: 'Lift It', icon: '⚖️', blurb: 'Put the pivot where Max can lift the boulder.', lesson: 'A long arm makes a small push into a big lift.' },
  roof: { title: 'Hold It Up', icon: '🐑', blurb: 'Build a roof so no rock lands on the sheep.', lesson: 'Loads need a path down to the ground.' },
};

export type LoadDef =
  | { type: 'cart'; mass: number; crates: number; label: string; max?: boolean }
  | { type: 'goat'; mass: number; speed: number; count: number; label: string; max?: boolean }
  | { type: 'quake'; amp: number; freq: number; seconds: number; label: string; max?: boolean }
  | { type: 'rocks'; mass: number; count: number; label: string; max?: boolean }
  | { type: 'drop'; mass: number; label: string; max?: boolean };

export interface LevelDef {
  mode: ModeId;
  tier: Tier;
  prompt: string;
  words: string;
  ground: [number, number, number, number][];
  anchors: [number, number][];
  build: { x1: number; y1: number; x2: number; y2: number };
  tools: ToolKind[];
  budget: number;
  par: number;
  loads: LoadDef[];
  /** Anything below this y has fallen into the river / off the world. */
  failY?: number;
  /** Cart must get past this x. */
  goalX?: number;
  /** Stand Up: the top of the stack must reach (be above) this y. */
  starY?: number;
  /** Roof: nothing may enter this box. */
  zone?: { x1: number; y1: number; x2: number; y2: number };
  /** Lift It: the plank, its pivot choices and masses. */
  lever?: { x1: number; x2: number; y: number; pivotXs: number[]; boulderMass: number; liftY: number };
  water?: number;
}

function bridge(tier: Tier): LevelDef {
  const gap = [6, 8, 12][tier - 1];
  const left = 12 - gap / 2;
  const right = 12 + gap / 2;
  const deck = 8;
  const rock = tier === 1 ? [] : [[12, 11] as [number, number]];
  return {
    mode: 'bridge', tier,
    prompt: `Bridge the ${gap}-cell gap`,
    words: `Build a bridge across the gap. Then press TEST and the cart will try to cross.`,
    ground: [[0, deck, left, deck], [left, deck, left, 13], [right, 13, right, deck], [right, deck, 24, deck], [left, 13, right, 13]],
    anchors: [[left, deck], [left, deck + 1], [left, deck + 2], [right, deck], [right, deck + 1], [right, deck + 2], ...rock],
    build: { x1: left - 2, y1: 3, x2: right + 2, y2: 12 },
    tools: ['beam', 'long', 'pillar', 'brace', 'rope', 'eraser'],
    budget: [14, 20, 26][tier - 1],
    par: [8, 13, 18][tier - 1],
    loads: tier === 3
      ? [{ type: 'cart', mass: 4, crates: 1, label: 'One crate' }, { type: 'cart', mass: 16, crates: 0, label: 'Max!', max: true }]
      : [{ type: 'cart', mass: 3, crates: 1, label: 'One crate' }, { type: 'cart', mass: [7, 9, 9][tier - 1], crates: 3, label: 'Three crates' }],
    failY: 12.5,
    goalX: 22.5,
    water: 11,
  };
}

function wobble(tier: Tier): LevelDef {
  const w = [3, 4, 5][tier - 1];
  return {
    mode: 'wobble', tier,
    prompt: `A gate ${w} wide, ${w} tall`,
    words: `Build a gate on the two bolts, ${w} cells tall. Then press TEST and a goat will run into it.`,
    ground: [[0, 11, 24, 11]],
    anchors: [[10, 11], [10 + w, 11]],
    build: { x1: 7, y1: 3, x2: 17, y2: 11 },
    tools: ['beam', 'pillar', 'brace', 'rope', 'eraser'],
    budget: [12, 16, 22][tier - 1],
    par: [8, 11, 15][tier - 1],
    loads: tier === 3
      ? [{ type: 'goat', mass: 3, speed: 5, count: 1, label: 'One goat' }, { type: 'goat', mass: 8, speed: 6, count: 1, label: 'Max charges!', max: true }]
      : [{ type: 'goat', mass: 3, speed: 5, count: 1, label: 'One goat' }, { type: 'goat', mass: 4, speed: 6, count: 2, label: 'Two goats' }],
    starY: 11 - w,
  };
}

function stand(tier: Tier): LevelDef {
  const starY = [7, 6, 5][tier - 1];
  return {
    mode: 'stand', tier,
    prompt: `Stack up to the star`,
    words: `Stack blocks until the tower reaches the star. Then press TEST for an earthquake.`,
    ground: [[0, 11, 24, 11]],
    anchors: [],
    build: { x1: 8, y1: 2, x2: 16, y2: 11 },
    tools: ['block', 'wide', 'eraser'],
    budget: [10, 12, 14][tier - 1],
    par: [8, 10, 12][tier - 1],
    loads: [
      { type: 'quake', amp: [0.2, 0.25, 0.3][tier - 1], freq: 1.2, seconds: 4, label: 'Small shake' },
      tier === 3 ? { type: 'drop', mass: 10, label: 'Max stomps!', max: true } : { type: 'quake', amp: [0.36, 0.42][tier - 1], freq: 1.2, seconds: 5, label: 'Big shake' },
    ],
    starY,
  };
}

function lift(tier: Tier): LevelDef {
  const boulder = [8, 12, 18][tier - 1];
  return {
    mode: 'lift', tier,
    prompt: `Lift the ${boulder}-tonne boulder`,
    words: `Tap where the pivot goes under the plank. Then press TEST and Max will jump on the other end.`,
    ground: [[0, 11, 24, 11]],
    anchors: [],
    build: { x1: 6, y1: 8, x2: 18, y2: 11 },
    tools: ['pivot'],
    budget: 0,
    par: 0,
    loads: [{ type: 'drop', mass: 4, label: 'Max jumps on', max: true }],
    lever: { x1: 6, x2: 16, y: 9.4, pivotXs: [7, 8, 9, 10, 11, 12, 13, 14, 15], boulderMass: boulder, liftY: 7.6 },
  };
}

function roof(tier: Tier): LevelDef {
  const span = [4, 6, 8][tier - 1];
  const x1 = 12 - span / 2;
  const x2 = 12 + span / 2;
  return {
    mode: 'roof', tier,
    prompt: `A roof over the sheep`,
    words: `Build a roof over the sheep pen, standing on the bolts. Then press TEST and rocks will fall.`,
    ground: [[0, 11, 24, 11]],
    anchors: [[x1, 11], [x2, 11], [x1, 10], [x2, 10]],
    build: { x1: x1 - 2, y1: 2, x2: x2 + 2, y2: 11 },
    tools: ['beam', 'long', 'pillar', 'brace', 'rope', 'eraser'],
    budget: [14, 20, 26][tier - 1],
    par: [10, 14, 19][tier - 1],
    loads: tier === 3
      ? [{ type: 'rocks', mass: 2, count: 5, label: 'Pebbles' }, { type: 'drop', mass: 14, label: 'Max lands on it!', max: true }]
      : [{ type: 'rocks', mass: 2, count: 5, label: 'Pebbles' }, { type: 'rocks', mass: [5, 6, 6][tier - 1], count: 4, label: 'Boulders' }],
    zone: { x1: x1 + 0.3, y1: 8.6, x2: x2 - 0.3, y2: 11 },
  };
}

export function makeLevel(mode: ModeId, tier: Tier): LevelDef {
  switch (mode) {
    case 'bridge': return bridge(tier);
    case 'wobble': return wobble(tier);
    case 'stand': return stand(tier);
    case 'lift': return lift(tier);
    case 'roof': return roof(tier);
  }
}
