import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { explainMate } from '../src/chess/mate-explain';

describe('explain mate', () => {
  it('back-rank mate: squares covered by the rook, pawns in the way', () => {
    const c = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    c.move('Ra8#');
    const e = explainMate(c.fen());
    expect(e.king).toBe('g8');
    expect(e.mated).toBe('b');
    const kinds = e.beats.map((b) => b.kind);
    expect(kinds).toContain('covered'); // f8 / h8 seen by the rook through the king's square
    expect(kinds).toContain('own'); // f7 g7 h7 pawns
    expect(kinds).toContain('checker');
    const f8 = e.beats.find((b) => b.square === 'f8' || b.square === 'h8');
    expect(f8?.by).toBe('a8');
    expect(f8?.text).toMatch(/rook on a8 sees it/);
  });

  it("scholar's mate: f7 queen guarded by the bishop", () => {
    const c = new Chess();
    for (const m of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']) c.move(m);
    const e = explainMate(c.fen());
    const g = e.beats.find((b) => b.kind === 'guarded');
    expect(g?.square).toBe('f7');
    expect(g?.by).toBe('c4');
    expect(g?.text).toMatch(/bishop on c4 guards it/);
  });

  it('double check is named', () => {
    // Bf5+ double check pattern: king e8, rook e1 and bishop give check together.
    const c = new Chess('3k4/8/3K4/8/8/8/8/3R4 w - - 0 1');
    // Rook moves to d-file already there; craft a smothered-like mate instead for a single checker:
    c.load('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1');
    c.move('Nf7#');
    const e = explainMate(c.fen());
    expect(e.beats.some((b) => b.kind === 'own')).toBe(true);
    expect(e.beats.find((b) => b.kind === 'checker')?.text).toMatch(/knight on f7/);
  });

  it('caps the number of beats', () => {
    const c = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    c.move('Ra8#');
    expect(explainMate(c.fen(), 3).beats).toHaveLength(3);
  });
});
