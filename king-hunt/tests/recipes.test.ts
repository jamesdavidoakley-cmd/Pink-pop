import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { RECIPES } from '../src/content/recipes';
import { analyseAttack } from '../src/chess/attack-lens';

describe('attack recipes', () => {
  for (const r of RECIPES) {
    it(`${r.id}: legal line, player moves annotated, baits pay off`, () => {
      const c = new Chess(r.fen);
      const scores: number[] = [];
      for (let i = 0; i < r.moves.length; i++) {
        const mv = c.move(r.moves[i]!);
        expect(mv, `${r.id} ply ${i} ${r.moves[i]}`).toBeTruthy();
        scores.push(analyseAttack(c, r.side).score);
        const playerPly = (r.side === 'w' ? 0 : 1) === i % 2;
        if (i >= r.start && playerPly) {
          expect(r.steps[String(i)], `${r.id}: step ${i} (${r.moves[i]}) needs a prompt and why`).toBeTruthy();
        }
        const step = r.steps[String(i)];
        if (step?.bait) {
          // The capture is the next ply; the payoff must show within two of our moves.
          const after = Math.min(r.moves.length - 1, step.bait.payoffPly ?? i + 4);
          const c2 = new Chess(r.fen);
          for (let j = 0; j <= after; j++) c2.move(r.moves[j]!);
          const before = scores[i - 1] ?? 0;
          const paid = analyseAttack(c2, r.side).score;
          expect(paid, `${r.id}: bait at ply ${i} (${r.moves[i]}) must raise pressure (${before} → ${paid})`).toBeGreaterThan(before);
          expect(step.bait.get.length).toBeGreaterThan(0);
          expect(step.bait.decoys.length).toBeGreaterThanOrEqual(2);
        }
      }
      // The whole plan raises attack pressure from start to finish.
      expect(scores[scores.length - 1]!).toBeGreaterThan(scores[r.start - 1] ?? 0);
      // Player is to move at `start`.
      expect((r.side === 'w' ? 0 : 1) === r.start % 2).toBe(true);
    });
  }
});
