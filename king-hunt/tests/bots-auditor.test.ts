import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { BOTS, chooseWithFlaws, flawBonus, moveFeatures } from '../src/game/bots';
import { audit } from '../src/game/auditor';
import { LADDER } from '../src/content/ladder';

describe('bot flaws', () => {
  it('every ladder bot exists', () => {
    for (const r of LADDER.rungs) expect(BOTS.find((b) => b.id === r.bot), r.bot).toBeTruthy();
  });
  it('a greedy bot takes the bait', () => {
    // Danish gambit: after 1.e4 e5 2.d4, black to move. exd4 is the greedy capture.
    const fen = new Chess('rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2').fen();
    const lines = [
      { multipv: 1, move: 'b8c6', cp: 10, depth: 4 },
      { multipv: 2, move: 'e5d4', cp: 5, depth: 4 },
      { multipv: 3, move: 'd7d6', cp: 0, depth: 4 },
    ];
    const greedy = { ...BOTS[0]!, flaws: { greedy: 1 } };
    let took = 0;
    for (let i = 0; i < 50; i++) if (chooseWithFlaws(fen, lines, greedy) === 'e5d4') took++;
    expect(took).toBeGreaterThan(35);
  });
  it('a late castler avoids castling', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5';
    const f = moveFeatures(fen, 'e1g1');
    expect(f.isCastle).toBe(true);
    expect(flawBonus(f, { lateCastle: 1 })).toBeLessThan(0);
  });
  it('a roof pusher likes pushing pawns in front of its castled king', () => {
    const fen = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b - - 0 6';
    expect(moveFeatures(fen, 'g7g5').roofPawn).toBe(true);
    expect(moveFeatures(fen, 'a7a5').roofPawn).toBe(false);
  });
  it('never picks a move outside the slack', () => {
    const fen = new Chess().fen();
    const lines = [
      { multipv: 1, move: 'e2e4', cp: 30, depth: 4 },
      { multipv: 2, move: 'f2f3', cp: -500, depth: 4 },
    ];
    for (let i = 0; i < 20; i++) expect(chooseWithFlaws(fen, lines, BOTS[0]!)).toBe('e2e4');
  });
});

describe('sacrifice auditor', () => {
  it('credits the Greek gift as paid when the attack arrives', () => {
    const before = 'rnbq1rk1/pp1nbppp/4p3/2ppP3/3P4/2NB1N2/PPP2PPP/R2QK2R w KQ - 0 8';
    const c = new Chess(before);
    for (const m of ['Bxh7+', 'Kxh7', 'Ng5+', 'Kg8', 'Qh5']) c.move(m);
    const a = audit(before, c.fen(), 'w', 250);
    expect(a.gave).toBe(2); // bishop (3) for a pawn (1)
    expect(a.verdict).toBe('paid');
  });
  it('calls a pointless piece drop a giveaway', () => {
    const before = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const c = new Chess(before);
    for (const m of ['Nxe5', 'Nxe5']) c.move(m);
    const a = audit(before, c.fen(), 'w', -150);
    expect(a.gave).toBe(2);
    expect(a.verdict).toBe('giveaway');
  });
  it('labels a sound-looking but refuted sac a gamble', () => {
    const before = 'rnbq1rk1/pp1nbppp/4p3/2ppP3/3P4/2NB1N2/PPP2PPP/R2QK2R w KQ - 0 8';
    const c = new Chess(before);
    for (const m of ['Bxh7+', 'Kxh7', 'Ng5+', 'Kg8', 'Qh5']) c.move(m);
    expect(audit(before, c.fen(), 'w', -300).verdict).toBe('gamble');
  });
  it('is silent when nothing was given', () => {
    const c = new Chess();
    const before = c.fen();
    c.move('e4');
    c.move('e5');
    expect(audit(before, c.fen(), 'w', 20).verdict).toBe('none');
  });
});
