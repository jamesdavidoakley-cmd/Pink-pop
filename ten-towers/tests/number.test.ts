import { describe, expect, it } from 'vitest';
import { digitsOf, toWords, valueOf, mulberry32 } from '../src/number';
import { Tower } from '../src/tower';
import { makeLevel, MODES, TIERS } from '../src/levels';

describe('number words', () => {
  it('speaks British English', () => {
    expect(toWords(0)).toBe('zero');
    expect(toWords(7)).toBe('seven');
    expect(toWords(15)).toBe('fifteen');
    expect(toWords(40)).toBe('forty');
    expect(toWords(47)).toBe('forty-seven');
    expect(toWords(100)).toBe('one hundred');
    expect(toWords(347)).toBe('three hundred and forty-seven');
    expect(toWords(1000)).toBe('one thousand');
    expect(toWords(1006)).toBe('one thousand and six');
    expect(toWords(1206)).toBe('one thousand, two hundred and six');
    expect(toWords(9999)).toBe('nine thousand, nine hundred and ninety-nine');
    expect(toWords(10000)).toBe('ten thousand');
  });
  it('digits round-trip', () => {
    for (const n of [0, 5, 10, 99, 100, 347, 1000, 4096, 9999]) expect(valueOf(digitsOf(n))).toBe(n);
    expect(digitsOf(10000)).toEqual([0, 0, 0, 10]);
  });
});

describe('tower', () => {
  it('carries when ten gems fuse', () => {
    const t = new Tower();
    t.set(9);
    const ev = t.add(0);
    expect(ev.map((e) => e.type)).toEqual(['add', 'fuse']);
    expect(t.counts).toEqual([0, 1, 0, 0]);
    expect(t.value()).toBe(10);
  });
  it('cascades 999 + 1 into a cube', () => {
    const t = new Tower();
    t.set(999);
    const ev = t.add(0);
    expect(ev.map((e) => e.type)).toEqual(['add', 'fuse', 'fuse', 'fuse']);
    expect(t.counts).toEqual([0, 0, 0, 1]);
  });
  it('smashes a rod into ten gems for borrowing', () => {
    const t = new Tower();
    t.set(42);
    expect(t.canSmash(1)).toBe(true);
    t.smash(1);
    expect(t.counts).toEqual([12, 3, 0, 0]);
    expect(t.value()).toBe(42);
    expect(t.canSmash(1)).toBe(false); // ones would overflow past 19
    for (let i = 0; i < 8; i++) t.remove(0);
    expect(t.value()).toBe(34);
  });
  it('refuses to remove from an empty column', () => {
    const t = new Tower();
    t.set(30);
    expect(t.remove(0)).toEqual([]);
  });
  it('tops out at 10,000', () => {
    const t = new Tower();
    t.set(9999);
    t.add(0);
    expect(t.value()).toBe(10000);
    expect(t.canAdd(0)).toBe(false);
    expect(t.canAdd(3)).toBe(false);
  });
});

describe('levels', () => {
  it('generates valid rounds for every mode and tier', () => {
    const rand = mulberry32(7);
    for (const mode of MODES) for (const tier of TIERS) for (let k = 0; k < 20; k++) {
      for (const r of makeLevel(mode, tier, rand)) {
        expect(r.target).toBeGreaterThanOrEqual(0);
        expect(r.target).toBeLessThanOrEqual(10000);
        expect(r.start).toBeGreaterThanOrEqual(0);
        const deltaValue = valueOf(r.delta);
        if (mode === 'build') expect(deltaValue).toBe(r.target);
        if (mode === 'add' || mode === 'make') expect(r.start + deltaValue).toBe(r.target);
        if (mode === 'take') expect(r.start - deltaValue).toBe(r.target);
        if (mode === 'round') {
          expect(r.choices).toContain(r.target);
          expect(Math.abs(r.target - r.start) * 2).toBeLessThanOrEqual(r.roundTo!);
          expect(r.target % r.roundTo!).toBe(0);
          expect(r.start % r.roundTo!).not.toBe(0);
        }
        expect(r.words.length).toBeGreaterThan(5);
      }
    }
  });
  it('take-away rounds are always solvable with smashes', () => {
    const rand = mulberry32(99);
    for (const tier of TIERS) for (const r of makeLevel('take', tier, rand)) {
      const t = new Tower();
      t.set(r.start);
      const remaining = [...r.delta];
      for (let p = 0; p <= 3; p++) {
        while (remaining[p] > 0) {
          if (t.counts[p] === 0) {
            expect(t.canSmash((p + 1) as 1 | 2 | 3)).toBe(true);
            t.smash((p + 1) as 1 | 2 | 3);
          }
          t.remove(p as 0 | 1 | 2 | 3);
          remaining[p]--;
        }
      }
      expect(t.value()).toBe(r.target);
      expect(t.isStandard()).toBe(true);
    }
  });
});
