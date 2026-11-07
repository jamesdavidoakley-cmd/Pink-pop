import { Chess } from 'chess.js';
import { fileOf, other, rankOf, sq, type Color, type Square } from './types';

/**
 * Why is this checkmate? For the mated king, every escape it might try and
 * the concrete reason it fails: a square covered by a named piece, a square
 * blocked by its own piece, a capture that is guarded, a checker that cannot
 * be taken or blocked. Feeds the mate cut scene's "escape tour".
 */
export type BeatKind = 'covered' | 'own' | 'guarded' | 'checker' | 'double';

export interface Beat {
  kind: BeatKind;
  square: Square; // the square the king tries (or the checker's square)
  by?: Square; // the piece that makes it fail
  text: string;
}

const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function explainMate(fen: string, maxBeats = 5): { king: Square; mated: Color; beats: Beat[] } {
  const chess = new Chess(fen);
  const mated: Color = chess.turn();
  const winner = other(mated);
  const king = chess.findPiece({ type: 'k', color: mated })[0] as Square;
  const his = mated === 'w' ? 'his' : 'his';
  const beats: Beat[] = [];

  // A copy without the king, so lines that pass through the king's square still count.
  const ghost = new Chess(fen);
  ghost.remove(king);

  const kf = fileOf(king);
  const kr = rankOf(king);
  const covered: Beat[] = [];
  const own: Beat[] = [];
  const guarded: Beat[] = [];
  for (const [df, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const f = kf + df;
    const r = kr + dr;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    const s = sq(f, r);
    const occ = chess.get(s);
    if (occ && occ.color === mated) {
      own.push({ kind: 'own', square: s, text: `${s}? ${capital(his)} own ${NAME[occ.type]} is in the way.` });
      continue;
    }
    const attackers = (ghost.attackers(s, winner) as Square[]).filter((a) => a !== s);
    if (occ && occ.color === winner) {
      if (attackers.length) {
        const by = attackers[0]!;
        guarded.push({ kind: 'guarded', square: s, by, text: `Take the ${NAME[occ.type]} on ${s}? The ${NAME[chess.get(by)!.type]} on ${by} guards it.` });
      }
      continue;
    }
    if (attackers.length) {
      const by = attackers[0]!;
      covered.push({ kind: 'covered', square: s, by, text: `${s}? The ${NAME[chess.get(by)!.type]} on ${by} sees it.` });
    }
  }

  // The checker(s): can it be taken or blocked?
  const checkers = chess.attackers(king, winner) as Square[];
  const checkerBeats: Beat[] = [];
  if (checkers.length >= 2) {
    checkerBeats.push({ kind: 'double', square: checkers[0]!, by: checkers[1]!, text: 'Two checks at once. You cannot take or block them both.' });
  } else if (checkers.length === 1) {
    const c = checkers[0]!;
    const cp = chess.get(c)!;
    const takers = (chess.attackers(c, mated) as Square[]).filter((t) => t !== king);
    if (takers.length) {
      const t = takers[0]!;
      checkerBeats.push({ kind: 'checker', square: c, by: t, text: `Take the ${NAME[cp.type]} with the ${NAME[chess.get(t)!.type]} on ${t}? It is pinned: moving it exposes the king.` });
    } else {
      const far = Math.max(Math.abs(fileOf(c) - kf), Math.abs(rankOf(c) - kr)) > 1 && cp.type !== 'n';
      checkerBeats.push({ kind: 'checker', square: c, text: far ? `Take or block the ${NAME[cp.type]} on ${c}? No piece can reach the line.` : `Take the ${NAME[cp.type]} on ${c}? Nothing can reach it.` });
    }
  }

  // Order: the real escape attempts first, one blocked-by-own example, the guarded capture, the checker.
  const ordered = [...covered.slice(0, 3), ...own.slice(0, 1), ...guarded.slice(0, 1), ...checkerBeats];
  for (const b of ordered) if (beats.length < maxBeats) beats.push(b);
  return { king, mated, beats };
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
