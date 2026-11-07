import { Chess } from 'chess.js';
import botsJson from '../../content/bots.json';
import type { Engine, PvLine } from '../chess/engine';
import { PIECE_VALUE, fileOf, rankOf, type Color, type PieceType } from '../chess/types';

/**
 * Sparring partners: Stockfish is the muscle, a flaw profile is the mind.
 * Each candidate move from MultiPV is re-scored by how well it expresses the
 * bot's flaws, so Max can learn to recognise and punish a specific weakness.
 */
export type Flaw = 'greedy' | 'blind' | 'lateCastle' | 'thinDefence' | 'roofPusher' | 'noLuft' | 'huddle' | 'queenTrader' | 'trader';

export interface BotSpec {
  id: string;
  name: string;
  blurb: string;
  skillLevel: number;
  depth: number;
  multiPv: number;
  slack: number; // centipawns: how far below the best line a flawed move may be
  flaws: Partial<Record<Flaw, number>>;
}

export const BOTS = (botsJson as { version: number; bots: BotSpec[] }).bots;
export function botById(id: string): BotSpec {
  return BOTS.find((b) => b.id === id) ?? BOTS[0]!;
}

/** Features of a candidate move, from the mover's point of view. Pure. */
export interface MoveFeatures {
  captureValue: number; // value of what is taken (0 if none)
  isCastle: boolean;
  couldCastle: boolean; // castling rights still exist for the mover
  roofPawn: boolean; // moves a pawn from in front of own (castled) king
  makesLuft: boolean; // a pawn move that gives the back-rank king a hole
  queenTrade: boolean; // queen takes queen
  tradesPiece: boolean; // capture of equal value with recapture likely
  hangs: number; // value of the moved piece if it lands on a square attacked more than defended
  huddles: boolean; // moves a piece next to own king
}

export function moveFeatures(fen: string, uci: string): MoveFeatures {
  const c = new Chess(fen);
  const me: Color = c.turn();
  const them: Color = me === 'w' ? 'b' : 'w';
  const from = uci.slice(0, 2) as Parameters<Chess['get']>[0];
  const to = uci.slice(2, 4) as Parameters<Chess['get']>[0];
  const piece = c.get(from);
  const target = c.get(to);
  const rights = c.getCastlingRights(me);
  const couldCastle = rights.k || rights.q;
  const king = c.findPiece({ type: 'k', color: me })[0]!;
  const homeRank = me === 'w' ? 0 : 7;
  const kingOnHome = rankOf(king) === homeRank;
  const mv = c.move({ from, to, promotion: (uci[4] as PieceType | undefined) ?? undefined });
  if (!mv || !piece) {
    return { captureValue: 0, isCastle: false, couldCastle, roofPawn: false, makesLuft: false, queenTrade: false, tradesPiece: false, hangs: 0, huddles: false };
  }
  const captureValue = target ? PIECE_VALUE[target.type] : mv.flags.includes('e') ? 1 : 0;
  const isCastle = mv.flags.includes('k') || mv.flags.includes('q');
  const inFront = piece.type === 'p' && kingOnHome && Math.abs(fileOf(from) - fileOf(king)) <= 1 && rankOf(from) === homeRank + (me === 'w' ? 1 : -1);
  const roofPawn = inFront && fileOf(king) !== 3 && fileOf(king) !== 4; // only counts once the king has left the centre
  const makesLuft = inFront && (fileOf(from) === 7 || fileOf(from) === 0 || Math.abs(fileOf(from) - fileOf(king)) === 1);
  const queenTrade = piece.type === 'q' && target?.type === 'q';
  const tradesPiece = !!target && PIECE_VALUE[target.type] === PIECE_VALUE[piece.type] && c.attackers(to, them).length > 0;
  const attackers = c.attackers(to, them).length;
  const defenders = c.attackers(to, me).length;
  const hangs = piece.type !== 'k' && attackers > 0 && (defenders === 0 || Math.min(...c.attackers(to, them).map((s) => PIECE_VALUE[c.get(s)!.type])) < PIECE_VALUE[piece.type]) ? PIECE_VALUE[piece.type] : 0;
  const kingAfter = c.findPiece({ type: 'k', color: me })[0]!;
  const huddles = piece.type !== 'k' && piece.type !== 'p' && Math.max(Math.abs(fileOf(to) - fileOf(kingAfter)), Math.abs(rankOf(to) - rankOf(kingAfter))) === 1;
  return { captureValue, isCastle, couldCastle, roofPawn, makesLuft, queenTrade, tradesPiece, hangs, huddles };
}

/** Centipawn bonus a flawed mind adds to a candidate. Pure. */
export function flawBonus(f: MoveFeatures, flaws: BotSpec['flaws']): number {
  let b = 0;
  const w = (k: Flaw) => flaws[k] ?? 0;
  b += w('greedy') * f.captureValue * 110; // grabs material, even bait
  b += w('blind') * f.hangs * 25; // happily leaves pieces en prise
  if (f.isCastle) b -= w('lateCastle') * 250; // puts castling off
  if (f.roofPawn) b += w('roofPusher') * 120; // pushes the pawns in front of the king
  if (f.makesLuft) b -= w('noLuft') * 200; // never makes a hole
  if (f.huddles) b += w('huddle') * 80; // crowds its own king
  if (f.queenTrade) b += w('queenTrader') * 200;
  if (f.tradesPiece) b += w('trader') * 80;
  if (w('thinDefence') && f.huddles) b -= w('thinDefence') * 120; // keeps defenders away from the king
  return b;
}

function scoreOf(l: PvLine): number {
  if (l.mate !== undefined) return l.mate > 0 ? 100000 - l.mate : -100000 - l.mate;
  return l.cp ?? 0;
}

/** Chooses among engine candidates with the bot's flaws applied. Exported for tests. */
export function chooseWithFlaws(fen: string, lines: PvLine[], bot: BotSpec, rand = Math.random): string {
  if (lines.length === 0) return '(none)';
  const best = Math.max(...lines.map(scoreOf));
  // Never pick something that is losing by more than the slack, flaws or not,
  // unless it is the only move: the bot stays beatable, not suicidal.
  const pool = lines.filter((l) => best - scoreOf(l) <= bot.slack);
  const scored = pool.map((l) => ({ l, s: scoreOf(l) + flawBonus(moveFeatures(fen, l.move), bot.flaws) }));
  const top = Math.max(...scored.map((x) => x.s));
  const weights = scored.map((x) => Math.exp((x.s - top) / 50));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return scored[i]!.l.move;
  }
  return scored[scored.length - 1]!.l.move;
}

export async function pickBotMove(engine: Engine, fen: string, bot: BotSpec): Promise<string> {
  const res = await engine.search(fen, { depth: bot.depth, multiPv: bot.multiPv, skillLevel: bot.skillLevel });
  if (res.lines.length === 0) return res.best;
  return chooseWithFlaws(fen, res.lines, bot);
}
