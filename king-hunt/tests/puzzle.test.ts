import { describe, expect, it } from 'vitest';
import { PuzzleRunner } from '../src/game/puzzle-runner';
import { EMPTY_PROGRESS, currentRungIndex, isUnlocked, recordSolve, streak } from '../src/game/progress';
import { LADDER, THEME_IDEA } from '../src/content/ladder';

const puzzle = { id: 'x', fen: 'start', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], rating: 800, themes: ['fork'] };

describe('puzzle runner', () => {
  it('walks the solution: player, scripted reply, player, complete', () => {
    const r = new PuzzleRunner(puzzle);
    expect(r.setupMove()).toBe('e2e4');
    expect(r.tryMove('e7e5')).toBe('correct');
    expect(r.opponentReply()).toBe('g1f3');
    expect(r.tryMove('b8c6')).toBe('complete');
    expect(r.isComplete()).toBe(true);
    expect(r.firstTry()).toBe(true);
  });
  it('counts wrong tries and escalates hints', () => {
    const r = new PuzzleRunner(puzzle);
    expect(r.tryMove('d7d5')).toBe('wrong');
    expect(r.hintLevel()).toBe(1);
    r.tryMove('a7a6');
    r.tryMove('h7h6');
    r.tryMove('h7h5');
    expect(r.hintLevel()).toBe(3);
    expect(r.firstTry()).toBe(false);
  });
  it('accepts any mating move on the final step', () => {
    const r = new PuzzleRunner({ ...puzzle, moves: ['e2e4', 'd8h4'] });
    expect(r.tryMove('d8h5', true)).toBe('complete');
  });
});

describe('progress', () => {
  it('unlocks the next rung after enough solves', () => {
    let p = EMPTY_PROGRESS;
    const first = LADDER.rungs[0]!.id;
    expect(isUnlocked(p, LADDER, 1)).toBe(false);
    for (let i = 0; i < LADDER.unlockAfter; i++) p = recordSolve(p, first, { firstTry: true, revealed: false }, '2026-11-07');
    expect(isUnlocked(p, LADDER, 1)).toBe(true);
    expect(currentRungIndex(p, LADDER)).toBe(1);
    expect(p.days).toEqual(['2026-11-07']);
  });
  it('computes a streak', () => {
    let p = EMPTY_PROGRESS;
    for (const d of ['2026-11-05', '2026-11-06', '2026-11-07']) p = recordSolve(p, 'finish-him', { firstTry: true, revealed: false }, d);
    expect(streak(p, '2026-11-07')).toBe(3);
    expect(streak(p, '2026-11-08')).toBe(3);
    expect(streak(p, '2026-11-09')).toBe(0);
  });
});

describe('ladder content', () => {
  it('every pack referenced has an idea and exists on disk', async () => {
    const fs = await import('node:fs');
    for (const r of LADDER.rungs) {
      for (const pack of r.packs) {
        expect(THEME_IDEA[pack], `idea for ${pack}`).toBeTruthy();
        expect(fs.existsSync(`content/puzzles/${pack}.json`), `pack ${pack}`).toBe(true);
      }
      expect(r.why.length).toBeGreaterThan(40);
    }
    // Opening up the king is taught early: rungs 2–5.
    expect(LADDER.rungs.slice(1, 5).map((r) => r.id)).toEqual(['the-weak-spot', 'keep-him-in-the-middle', 'castle-then-charge', 'rip-the-roof']);
  });
});
