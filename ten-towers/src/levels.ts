// Round generation for every mode and tier. Pure, seeded, tested.
import { digitsOf, randInt, toWords, withCommas, BLOCK_NAMES, plural } from './number';

export type Mode = 'build' | 'add' | 'take' | 'make';
export type Tier = 1 | 2 | 3;
export const MODES: Mode[] = ['build', 'add', 'take', 'make'];
export const TIERS: Tier[] = [1, 2, 3];
export const ROUNDS_PER_LEVEL = 5;

export const MODE_INFO: Record<Mode, { title: string; icon: string; blurb: string }> = {
  build: { title: 'Build It', icon: '🏗️', blurb: 'Build the number on the blueprint.' },
  add: { title: 'Add On', icon: '➕', blurb: 'Add blocks on top. Watch ten fuse into one!' },
  take: { title: 'Take Away', icon: '➖', blurb: 'Take blocks off. Smash one to make ten!' },
  make: { title: 'Make 100', icon: '🎯', blurb: 'Fill the tower to exactly 100 or 1,000.' },
};

export const TIER_INFO: Record<Tier, string> = { 1: 'to 100', 2: 'to 1,000', 3: 'to 10,000' };
const MAKE_TIER_INFO: Record<Tier, string> = { 1: 'tens → 100', 2: 'any → 100', 3: '→ 1,000' };

export function tierLabel(mode: Mode, tier: Tier): string {
  return mode === 'make' ? MAKE_TIER_INFO[tier] : TIER_INFO[tier];
}

export interface Round {
  mode: Mode;
  /** Blocks already standing when the round starts. */
  start: number;
  /** The number the tower must show at the end. */
  target: number;
  /** For add/take: how many of each block to add or remove, ones first. */
  delta: number[];
  /** Big text on the blueprint. */
  big: string;
  /** Spoken + written instruction. */
  words: string;
}

function describeBlocks(counts: number[]): string {
  const parts: string[] = [];
  for (let p = 3; p >= 0; p--) if (counts[p]) parts.push(plural(counts[p], BLOCK_NAMES[p]));
  if (parts.length <= 1) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function buildRound(tier: Tier, rand: () => number): Round {
  const ranges: Record<Tier, [number, number]> = { 1: [11, 99], 2: [101, 999], 3: [1001, 9999] };
  const [lo, hi] = ranges[tier];
  const target = randInt(rand, lo, hi);
  // Tricky blueprints (tier 3, sometimes tier 2): "4 slabs, 12 rods and 3 gems" → 523.
  const tricky = (tier === 3 && rand() < 0.45) || (tier === 2 && rand() < 0.25);
  if (tricky) {
    const counts = digitsOf(target);
    const p = tier === 3 ? randInt(rand, 0, 2) : randInt(rand, 0, 1);
    if (counts[p + 1] > 0) {
      counts[p + 1] -= 1;
      counts[p] += 10;
      return {
        mode: 'build', start: 0, target, delta: counts,
        big: describeBlocks(counts),
        words: `Build ${describeBlocks(counts)}. What number is that?`,
      };
    }
  }
  return {
    mode: 'build', start: 0, target, delta: digitsOf(target),
    big: withCommas(target),
    words: `Build ${toWords(target)}.`,
  };
}

function addRound(tier: Tier, rand: () => number): Round {
  let a = 0;
  let b = 0;
  for (let tries = 0; tries < 50; tries++) {
    if (tier === 1) { a = randInt(rand, 12, 79); b = randInt(rand, 11, 99 - a); }
    else if (tier === 2) { a = randInt(rand, 105, 799); b = randInt(rand, 101, 999 - a); }
    else { a = randInt(rand, 1005, 7999); b = randInt(rand, 1001, 9999 - a); }
    const carries = digitsOf(a).some((d, i) => d + digitsOf(b)[i] >= 10);
    if (carries || tries > 40) break; // we want a carry most of the time
  }
  return {
    mode: 'add', start: a, target: a + b, delta: digitsOf(b),
    big: `${withCommas(a)} + ${withCommas(b)}`,
    words: `The tower is ${toWords(a)}. Add ${describeBlocks(digitsOf(b))}.`,
  };
}

function takeRound(tier: Tier, rand: () => number): Round {
  let a = 0;
  let b = 0;
  for (let tries = 0; tries < 50; tries++) {
    if (tier === 1) { a = randInt(rand, 30, 99); b = randInt(rand, 11, a - 10); }
    else if (tier === 2) { a = randInt(rand, 300, 999); b = randInt(rand, 101, a - 100); }
    else { a = randInt(rand, 3000, 9999); b = randInt(rand, 1001, a - 1000); }
    const borrows = digitsOf(a).some((d, i) => d < digitsOf(b)[i]);
    if (borrows || tries > 40) break;
  }
  return {
    mode: 'take', start: a, target: a - b, delta: digitsOf(b),
    big: `${withCommas(a)} − ${withCommas(b)}`,
    words: `The tower is ${toWords(a)}. Take away ${describeBlocks(digitsOf(b))}.`,
  };
}

function makeRound(tier: Tier, rand: () => number): Round {
  let start: number;
  let target: number;
  if (tier === 1) { start = randInt(rand, 1, 9) * 10; target = 100; }
  else if (tier === 2) { start = randInt(rand, 11, 99); if (start % 10 === 0) start += 3; target = 100; }
  else { start = randInt(rand, 101, 999); if (start % 10 === 0) start += 7; target = 1000; }
  return {
    mode: 'make', start, target, delta: digitsOf(target - start),
    big: `${withCommas(start)} → ${withCommas(target)}`,
    words: `The tower is ${toWords(start)}. Make it exactly ${toWords(target)}.`,
  };
}

export function makeRoundFor(mode: Mode, tier: Tier, rand: () => number): Round {
  switch (mode) {
    case 'build': return buildRound(tier, rand);
    case 'add': return addRound(tier, rand);
    case 'take': return takeRound(tier, rand);
    case 'make': return makeRound(tier, rand);
  }
}

export function makeLevel(mode: Mode, tier: Tier, rand: () => number): Round[] {
  return Array.from({ length: ROUNDS_PER_LEVEL }, () => makeRoundFor(mode, tier, rand));
}
