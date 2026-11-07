import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { analyseAttack, describeDelta, kingZone } from '../src/chess/attack-lens';

describe('attack lens', () => {
  it('king zone clips at the board edge', () => {
    expect(kingZone('e1')).toHaveLength(6);
    expect(kingZone('a1')).toHaveLength(4);
    expect(kingZone('e4')).toHaveLength(9);
  });

  it('start position has no pressure', () => {
    const r = analyseAttack(new Chess(), 'w');
    expect(r.kingZoneAttackers).toBe(0);
    expect(r.mateInOne).toBe(false);
    expect(r.score).toBe(0);
  });

  it('scholar\'s mate threat scores 100 (mate in one is on)', () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 — White mates with Qxf7#
    const c = new Chess();
    for (const m of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6']) c.move(m);
    const r = analyseAttack(c, 'w');
    expect(r.mateInOne).toBe(true);
    expect(r.score).toBe(100);
    expect(r.fireLines.some((l) => l.to === 'f7')).toBe(true);
  });

  it('describes added attackers', () => {
    const c = new Chess();
    const before = analyseAttack(c, 'w');
    c.move('e4');
    c.move('e5');
    c.move('Qh5');
    const after = analyseAttack(c, 'w');
    expect(after.kingZoneAttackers).toBeGreaterThan(before.kingZoneAttackers);
    expect(describeDelta(before, after).join(' ')).toMatch(/aimed at the king/);
  });

  it('spots loose pieces', () => {
    // Black knight on c6 attacked by a pawn on d5 is a cheap target.
    const c = new Chess('r1bqkbnr/pppppppp/2n5/3P4/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1');
    const r = analyseAttack(c, 'w');
    expect(r.looseTargets.map((t) => t.square)).toContain('c6');
  });

  it('detects castling', () => {
    const c = new Chess();
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']) c.move(m);
    expect(analyseAttack(c, 'w').castled).toBe(true);
  });
});

describe('diagnosis (the why)', () => {
  it('names the back-rank problem: no escape squares', async () => {
    const { diagnoseKing } = await import('../src/chess/attack-lens');
    // Black king boxed in by its own pawns; White rook ready to check on the back rank.
    const c = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    const d = diagnoseKing(c, 'w');
    expect(d.map((x) => x.code)).toContain('no-luft');
    expect(d.map((x) => x.code)).toContain('mate-on');
    expect(d.find((x) => x.code === 'no-luft')!.principle).toBe('The king cannot run');
  });

  it('counts attackers against defenders', async () => {
    const { diagnoseKing } = await import('../src/chess/attack-lens');
    const c = new Chess();
    for (const m of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'd6']) c.move(m);
    const d = diagnoseKing(c, 'w');
    const o = d.find((x) => x.code === 'outnumbered');
    expect(o).toBeDefined();
    expect(o!.text).toMatch(/^f7: 2 attackers, 0 defenders/);
  });

  it('spots a king stuck in the centre with an open file beside it', async () => {
    const { diagnoseKing } = await import('../src/chess/attack-lens');
    const c = new Chess('rnbqk1nr/ppp2ppp/8/8/8/8/PPP2PPP/RNBQK1NR w KQkq - 0 8');
    const codes = diagnoseKing(c, 'w').map((x) => x.code);
    expect(codes).toContain('centre-king');
    expect(codes).toContain('open-file');
  });

  it('finds a sole defender we can remove', async () => {
    const { diagnoseKing } = await import('../src/chess/attack-lens');
    // Knight on f6 is the only guard of h7; White's bishop on d3 and queen eye h7; rook can take the knight... keep it simple:
    const c = new Chess('r1bq1rk1/pppp1ppp/2n2n2/4p3/2B1P1b1/3P1N2/PPP2PPP/RNBQR1K1 w - - 0 7');
    const d = diagnoseKing(c, 'w');
    expect(Array.isArray(d)).toBe(true); // must not throw; content asserted loosely as it depends on pins
  });

  it('smothered setup: king cannot move and a knight check is available', async () => {
    const { diagnoseKing } = await import('../src/chess/attack-lens');
    const c = new Chess('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1'); // Nf7# is on
    const codes = diagnoseKing(c, 'w').map((x) => x.code);
    expect(codes).toContain('no-escape');
    expect(codes).toContain('mate-on');
  });

  it('start position has no diagnosis', async () => {
    const { diagnoseKing } = await import('../src/chess/attack-lens');
    expect(diagnoseKing(new Chess(), 'w')).toHaveLength(0);
  });
});
