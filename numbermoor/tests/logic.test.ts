import { describe, expect, it } from 'vitest';
import { makePotion, PotionGame, weight } from '../src/potions';
import { factorPairs, isPrime, BroomGame, makeBroomRound } from '../src/brooms';

function mulberry32(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe('potion scales', () => {
  it('every generated puzzle balances and is solvable by same-to-both-sides moves', () => {
    const rand = mulberry32(3);
    for (const tier of [1, 2, 3] as const) for (let k = 0; k < 60; k++) {
      const p = makePotion(tier, rand);
      expect(weight(p.left, p.x)).toBe(weight(p.right, p.x));
      const g = new PotionGame(p);
      // strategy: strip bottles pairwise, strip drops pairwise, halve while twins remain
      while (g.left.bottles > 0 && g.right.bottles > 0) { g.removeBottle('left'); g.removeBottle('right'); }
      const d = Math.min(g.left.drops, g.right.drops); g.removeDrops('left', d); g.removeDrops('right', d);
      while (!g.isolated() && g.canHalve()) g.halve();
      expect(g.balanced()).toBe(true);
      expect(g.isolated()).not.toBeNull();
      const side = g.isolated()!; const other = side === 'left' ? g.right : g.left;
      expect(other.drops).toBe(p.x);
    }
  });
  it('taking from one pan only tips the scale; the mystery bottle cannot be removed alone', () => {
    const g = new PotionGame({ x: 4, left: { bottles: 1, drops: 3 }, right: { bottles: 0, drops: 7 }, tier: 1, words: '' });
    expect(g.balanced()).toBe(true);
    g.removeDrops('left', 3);
    expect(g.balanced()).toBe(false);
    expect(g.tilt()).toBe(3);
    expect(g.canRemoveBottle('left')).toBe(false);
    g.removeDrops('right', 3);
    expect(g.isolated()).toBe('left');
    expect(g.undo()).toBe(true);
    expect(g.balanced()).toBe(false);
  });
  it('halving only when everything is even', () => {
    const g = new PotionGame({ x: 3, left: { bottles: 2, drops: 0 }, right: { bottles: 0, drops: 6 }, tier: 2, words: '' });
    expect(g.canHalve()).toBe(true);
    g.halve();
    expect(g.left).toEqual({ bottles: 1, drops: 0 });
    expect(g.right.drops).toBe(3);
    expect(g.isolated()).toBe('left');
    const odd = new PotionGame({ x: 3, left: { bottles: 2, drops: 1 }, right: { bottles: 0, drops: 7 }, tier: 2, words: '' });
    expect(odd.canHalve()).toBe(false);
  });
});

describe('broom formations', () => {
  it('factor pairs and primes', () => {
    expect(factorPairs(12)).toEqual([[1, 12], [2, 6], [3, 4], [4, 3], [6, 2], [12, 1]]);
    expect(factorPairs(13)).toEqual([[1, 13], [13, 1]]);
    expect(isPrime(13)).toBe(true); expect(isPrime(9)).toBe(false); expect(isPrime(1)).toBe(false);
  });
  it('flying with the wrong product reports remainder or shortfall', () => {
    const g = new BroomGame({ n: 12, prime: false, words: '' });
    g.setRows(3); g.setCols(3);
    const r = g.fly();
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.product).toBe(9); expect(r.leftover).toBe(3); }
    g.setRows(3); g.setCols(5);
    const s = g.fly();
    if (!s.ok) { expect(s.short).toBe(3); }
    g.setRows(3); g.setCols(4);
    expect(g.fly().ok).toBe(true);
    g.swap();
    expect(g.rows).toBe(4);
    expect(g.fly().ok).toBe(true);
    expect(g.found.size).toBe(2);
    expect(g.complete()).toBe(false);
    for (const [r2, c2] of g.pairs) { g.setRows(r2); g.setCols(c2); g.fly(); }
    expect(g.complete()).toBe(true);
  });
  it('rounds stay within tier pools', () => {
    const rand = mulberry32(9);
    for (let i = 0; i < 40; i++) { expect(makeBroomRound(1, rand).n).toBeLessThanOrEqual(12); expect(makeBroomRound(3, rand).n).toBeLessThanOrEqual(36); }
  });
});
