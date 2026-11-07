/**
 * The Attack Lens: turns a position into "how hard is this side attacking?"
 *
 * This is the pedagogical heart of King Hunt. Stockfish tells us the truth
 * about who is winning; the lens tells us how much *pressure* a side is
 * generating against the enemy king and pieces. Max is coached on the lens
 * first and the truth second.
 *
 * Everything here is pure and cheap (no engine), so it can run every move
 * and drive the heat map / fire lines / storm visuals in real time.
 */
import { Chess } from 'chess.js';
import { PIECE_VALUE, fileOf, other, rankOf, sq, type Color, type Square } from './types';

export interface SquarePressure {
  square: Square;
  attackers: Square[]; // attacker squares of `side`
}

export interface FireLine {
  from: Square; // attacking piece
  to: Square; // king-zone square it hits
}

export interface XRay {
  from: Square; // our sliding piece
  to: Square; // king-zone square at the end of the road
  through: Square[]; // our own non-pawn pieces in the way (they can step aside with tempo)
}

export interface AttackReport {
  side: Color;
  enemyKing: Square;
  kingZone: Square[];
  /** attackers per king-zone square (sum = kingZoneAttackers) */
  zonePressure: SquarePressure[];
  kingZoneAttackers: number;
  zoneSquaresHit: number;
  fireLines: FireLine[];
  /** roads to the king zone that only our own pieces block: the payoff of a lever or a sacrifice */
  xrays: XRay[];
  /** enemy pieces we attack that are undefended or attacked by something cheaper */
  looseTargets: { square: Square; value: number; by: Square }[];
  givesCheck: boolean;
  /** we have a legal move that mates right now (only meaningful when it's our move) */
  mateInOne: boolean;
  /** 0..4 minor pieces developed off the back rank */
  developed: number;
  castled: boolean;
  /** 0..100 */
  score: number;
}

const ZONE_OFFSETS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function kingZone(king: Square): Square[] {
  const f = fileOf(king);
  const r = rankOf(king);
  const out: Square[] = [];
  for (const [df, dr] of ZONE_OFFSETS) {
    const nf = f + df;
    const nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.push(sq(nf, nr));
  }
  return out;
}

/** Build a copy of the position with `side` to move (so we can ask "could we mate now?"). */
function withSideToMove(chess: Chess, side: Color): Chess | null {
  if (chess.turn() === side) return chess;
  const parts = chess.fen().split(' ');
  parts[1] = side;
  parts[3] = '-'; // en-passant square is meaningless after a null move
  try {
    return new Chess(parts.join(' '));
  } catch {
    return null; // e.g. the other side is in check: a null move is illegal there
  }
}

function hasMateInOne(chess: Chess, side: Color): boolean {
  const c = withSideToMove(chess, side);
  if (!c) return false;
  for (const m of c.moves({ verbose: true })) {
    if (m.san.endsWith('#')) return true;
  }
  return false;
}

const SLIDES: Record<'r' | 'b' | 'q', [number, number][]> = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

/** Lines from our sliders to the king zone where the only blockers are our own non-pawn pieces. */
export function findXRays(chess: Chess, side: Color, zone: Square[]): XRay[] {
  const zoneSet = new Set(zone);
  const out: XRay[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== side || !(cell.type in SLIDES)) continue;
      const from = cell.square as Square;
      for (const [df, dr] of SLIDES[cell.type as 'r' | 'b' | 'q']) {
        let f = fileOf(from) + df;
        let r = rankOf(from) + dr;
        const through: Square[] = [];
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
          const s = sq(f, r);
          const p = chess.get(s);
          if (zoneSet.has(s)) {
            if (through.length > 0 && through.length <= 2) out.push({ from, to: s, through: [...through] });
            break; // direct hits are already counted as attackers
          }
          if (p) {
            if (p.color !== side || p.type === 'p') break; // enemy piece or our pawn: not a road
            through.push(s);
            if (through.length > 2) break;
          }
          f += df;
          r += dr;
        }
      }
    }
  }
  return out;
}

export function analyseAttack(chess: Chess, side: Color): AttackReport {
  const enemy = other(side);
  const enemyKing = chess.findPiece({ type: 'k', color: enemy })[0] as Square;
  const zone = kingZone(enemyKing);

  const zonePressure: SquarePressure[] = zone.map((s) => ({
    square: s,
    attackers: chess.attackers(s, side) as Square[],
  }));
  const fireLines: FireLine[] = [];
  for (const zp of zonePressure) for (const a of zp.attackers) fireLines.push({ from: a, to: zp.square });

  const kingZoneAttackers = zonePressure.reduce((n, z) => n + z.attackers.length, 0);
  const zoneSquaresHit = zonePressure.filter((z) => z.attackers.length > 0).length;

  const looseTargets: AttackReport['looseTargets'] = [];
  let developed = 0;
  let castled = false;
  const homeRank = side === 'w' ? 0 : 7;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const s = cell.square as Square;
      if (cell.color === enemy && cell.type !== 'k') {
        const by = chess.attackers(s, side) as Square[];
        if (by.length === 0) continue;
        const defenders = chess.attackers(s, enemy);
        const cheapest = Math.min(...by.map((b) => PIECE_VALUE[chess.get(b)!.type]));
        if (defenders.length === 0 || cheapest < PIECE_VALUE[cell.type]) {
          looseTargets.push({ square: s, value: PIECE_VALUE[cell.type], by: by[0]! });
        }
      }
      if (cell.color === side) {
        if ((cell.type === 'n' || cell.type === 'b') && rankOf(s) !== homeRank) developed++;
        if (cell.type === 'k') {
          const f = fileOf(s);
          castled = rankOf(s) === homeRank && (f === 6 || f === 2) && !chess.getCastlingRights(side).k && !chess.getCastlingRights(side).q;
        }
      }
    }
  }

  const givesCheck = chess.turn() === enemy && chess.inCheck();
  const mateInOne = hasMateInOne(chess, side);
  const xrays = findXRays(chess, side, zone);

  // Score: pressure on the king dominates, loose pieces and development support it.
  let score = 0;
  score += Math.min(kingZoneAttackers, 8) * 7; // up to 56
  score += Math.min(zoneSquaresHit, 6) * 3; // up to 18
  score += Math.min(xrays.length, 3) * 3; // up to 9: open roads count even before the blocker steps aside
  score += Math.min(looseTargets.reduce((n, t) => n + t.value, 0), 9) * 1.5; // up to 13.5
  score += developed * 2; // up to 8
  score += castled ? 4 : 0;
  if (givesCheck) score += 8;
  if (mateInOne) score = 100;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    side,
    enemyKing,
    kingZone: zone,
    zonePressure,
    kingZoneAttackers,
    zoneSquaresHit,
    fireLines,
    xrays,
    looseTargets,
    givesCheck,
    mateInOne,
    developed,
    castled,
    score,
  };
}

/** Plain-English nuggets about what changed between two reports (same side). */
export function describeDelta(before: AttackReport, after: AttackReport): string[] {
  const out: string[] = [];
  if (after.mateInOne && !before.mateInOne) out.push('Checkmate is on the board. Find it!');
  if (after.givesCheck) out.push('Check! The king has to answer you.');
  const dz = after.kingZoneAttackers - before.kingZoneAttackers;
  if (dz >= 2) out.push(`${dz} more attackers aimed at the king.`);
  else if (dz === 1) out.push('One more piece aimed at the king.');
  else if (dz <= -2) out.push('You pulled pieces away from the king.');
  if (after.looseTargets.length > before.looseTargets.length) out.push('You are attacking a loose piece.');
  if (after.developed > before.developed) out.push('A new piece joins the fight.');
  if (after.castled && !before.castled) out.push('Castled. Your king is safe. Now go hunting.');
  return out;
}

// ---------------------------------------------------------------------------
// Diagnosis: WHY the enemy king is in trouble, as cause → effect sentences.
// This is what the coach says first. The move comes second.
// ---------------------------------------------------------------------------

export type DiagnosisCode = 'mate-on' | 'no-luft' | 'no-escape' | 'outnumbered' | 'centre-king' | 'open-file' | 'sole-defender';

export interface Diagnosis {
  code: DiagnosisCode;
  /** plain words for a 7-year-old, mechanism first */
  text: string;
  /** which of the five principles this is an instance of */
  principle: 'Initiative' | 'Tempo' | 'Material is fuel' | 'Open lines' | 'The king cannot run';
  squares: Square[];
}

const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function diagnoseKing(chess: Chess, side: Color): Diagnosis[] {
  const enemy = other(side);
  const king = chess.findPiece({ type: 'k', color: enemy })[0] as Square;
  const zone = kingZone(king);
  const out: Diagnosis[] = [];

  if (hasMateInOne(chess, side)) {
    out.push({ code: 'mate-on', text: 'Checkmate is on the board. The king has nowhere left to go.', principle: 'The king cannot run', squares: [king] });
  }

  const us = withSideToMove(chess, side);
  const ourMoves = us ? us.moves({ verbose: true }) : [];
  const checksAvailable = ourMoves.filter((m) => m.san.includes('+') || m.san.includes('#'));
  const homeRank = enemy === 'w' ? 0 : 7;
  const kf = fileOf(king);

  // Back rank: no hole in front of the king, and a heavy piece could check along the rank.
  if (rankOf(king) === homeRank) {
    const frontRank = homeRank + (enemy === 'w' ? 1 : -1);
    const front = [kf - 1, kf, kf + 1].filter((f) => f >= 0 && f < 8).map((f) => sq(f, frontRank));
    const sealed = front.every((s) => chess.get(s)?.color === enemy || chess.isAttacked(s, side));
    const backRankCheck = checksAvailable.some((m) => (m.piece === 'r' || m.piece === 'q') && rankOf(m.to as Square) === homeRank);
    let crowd = 0;
    for (let f = 0; f < 8; f++) {
      const p = chess.get(sq(f, homeRank));
      if (p && p.color === enemy && p.type !== 'k') crowd++;
    }
    if (sealed && (backRankCheck || crowd <= 2)) {
      out.push({
        code: 'no-luft',
        text: backRankCheck
          ? 'No hole in front of the king. A check along the back rank is deadly.'
          : 'No hole in front of the king. Get a rook or queen to the back rank.',
        principle: 'The king cannot run',
        squares: [king, ...front],
      });
    }
  }

  // Fully boxed in: the king has no legal move at all and we can give check.
  if (checksAvailable.length > 0) {
    const them = chess.turn() === enemy ? chess : withSideToMove(chess, enemy);
    const kingMoves = them ? them.moves({ square: king, verbose: true }) : [];
    if (them && kingMoves.length === 0 && !them.inCheck()) {
      out.push({ code: 'no-escape', text: 'The king cannot move at all. One check it cannot block or capture is mate.', principle: 'The king cannot run', squares: [king] });
    }
  }

  // Per-square: a king-zone square where we outnumber the defenders.
  let bestSq: Square | null = null;
  let bestA = 0;
  let bestD = 0;
  for (const s of zone) {
    const a = chess.attackers(s, side).length;
    const d = chess.attackers(s, enemy).filter((x) => x !== king).length;
    if (a >= 2 && a > d && a - d > bestA - bestD) {
      bestSq = s;
      bestA = a;
      bestD = d;
    }
  }
  if (bestSq) {
    out.push({
      code: 'outnumbered',
      text: `${bestSq}: ${bestA} attackers, ${bestD} defender${bestD === 1 ? '' : 's'}. That square falls.`,
      principle: 'Initiative',
      squares: [bestSq],
    });
  }

  // King still in the middle after the opening has begun.
  const fullmove = Number(chess.fen().split(' ')[5] ?? 1);
  if (rankOf(king) === homeRank && (kf === 3 || kf === 4) && fullmove >= 5) {
    out.push({ code: 'centre-king', text: 'The king is still in the middle. Open the centre before it can castle.', principle: 'The king cannot run', squares: [king] });
  }

  // A road along a file to the king zone that only our own piece blocks (the lever's payoff).
  const road = findXRays(chess, side, zone).find((x) => fileOf(x.from) === fileOf(x.to) && (chess.get(x.from)?.type === 'r' || chess.get(x.from)?.type === 'q'));
  if (road) {
    const blocker = chess.get(road.through[0]!)!;
    out.push({ code: 'open-file', text: `The ${FILE_NAMES[fileOf(road.from)]}-file is your road to the king. Your ${PIECE_NAME[chess.get(road.from)!.type]} on ${road.from} sees ${road.to} through your own ${PIECE_NAME[blocker.type]}, which can step aside with a threat.`, principle: 'Open lines', squares: [road.from, ...road.through, road.to] });
  }
  // Open file on or beside the king, with a heavy piece of ours to use it.
  const heavy = chess.findPiece({ type: 'r', color: side }).length + chess.findPiece({ type: 'q', color: side }).length;
  if (heavy > 0 && !road) {
    for (const f of [kf - 1, kf, kf + 1]) {
      if (f < 0 || f > 7) continue;
      let pawnOnFile = false;
      for (let r = 0; r < 8; r++) {
        const p = chess.get(sq(f, r));
        if (p && p.type === 'p' && p.color === enemy) pawnOnFile = true;
      }
      if (!pawnOnFile) {
        out.push({ code: 'open-file', text: `The ${FILE_NAMES[f]}-file is open beside the king. A rook or queen belongs there.`, principle: 'Open lines', squares: Array.from({ length: 8 }, (_, r) => sq(f, r)) });
        break;
      }
    }
  }

  // Sole defender: a zone square we attack that exactly one enemy piece guards, and we can hit that guard.
  for (const s of zone) {
    if (chess.attackers(s, side).length === 0) continue;
    const guards = chess.attackers(s, enemy).filter((g) => g !== king);
    if (guards.length !== 1) continue;
    const g = guards[0]!;
    if (chess.attackers(g, side).length === 0) continue;
    const gp = chess.get(g)!;
    out.push({ code: 'sole-defender', text: `The ${PIECE_NAME[gp.type]} on ${g} is the only guard of ${s}. Remove it and ${s} falls.`, principle: 'Initiative', squares: [g, s] });
    break;
  }

  return out;
}

const FILE_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Coach line for a move: the new diagnosis first (the why), then what changed. */
export function coachLines(before: AttackReport, after: AttackReport, diagBefore: Diagnosis[], diagAfter: Diagnosis[]): string[] {
  const seen = new Set(diagBefore.map((d) => d.code));
  const fresh = diagAfter.filter((d) => !seen.has(d.code));
  const lines: string[] = [];
  if (fresh[0]) lines.push(fresh[0].text);
  const delta = describeDelta(before, after).filter((l) => !(fresh[0]?.code === 'mate-on' && l.startsWith('Checkmate')));
  if (delta[0]) lines.push(delta[0]);
  return lines;
}
