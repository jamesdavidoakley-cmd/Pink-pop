import { Chess } from 'chess.js';
import { analyseAttack, type AttackReport } from '../chess/attack-lens';
import { PIECE_VALUE, type Color } from '../chess/types';

/**
 * The sacrifice auditor: when the player gives material, did it buy anything?
 * A sacrifice is credited only when the pressure arrives AND the engine says
 * the position still holds. Giving pieces away is never rewarded.
 */
export type Verdict = 'paid' | 'gamble' | 'giveaway' | 'none';

export interface Audit {
  verdict: Verdict;
  gave: number; // material lost over the window
  pressureBefore: number;
  pressureAfter: number;
  newRoads: number; // x-rays + zone attackers gained
  evalCp: number | null; // engine eval after the window, from the player's side
  text: string;
}

export function material(chess: Chess, side: Color): number {
  let n = 0;
  for (const row of chess.board()) for (const cell of row) if (cell && cell.color === side && cell.type !== 'k') n += PIECE_VALUE[cell.type];
  return n;
}

/** Material balance for `side` (ours minus theirs). */
export function balance(chess: Chess, side: Color): number {
  return material(chess, side) - material(chess, side === 'w' ? 'b' : 'w');
}

export function audit(beforeFen: string, afterFen: string, side: Color, evalCp: number | null): Audit {
  const b = new Chess(beforeFen);
  const a = new Chess(afterFen);
  const gave = balance(b, side) - balance(a, side);
  const rb: AttackReport = analyseAttack(b, side);
  const ra: AttackReport = analyseAttack(a, side);
  const newRoads = ra.xrays.length + ra.kingZoneAttackers - (rb.xrays.length + rb.kingZoneAttackers);
  const pressureGain = ra.score - rb.score;
  const base = { gave, pressureBefore: rb.score, pressureAfter: ra.score, newRoads, evalCp };
  if (gave <= 0) return { ...base, verdict: 'none', text: '' };
  const bought = pressureGain >= 8 || newRoads >= 2 || ra.mateInOne || ra.givesCheck;
  const holds = evalCp === null || evalCp > -120;
  if (bought && holds) {
    return { ...base, verdict: 'paid', text: `You gave ${gave} and bought ${describe(ra, rb)}. That is a sacrifice: paid for.` };
  }
  if (bought && !holds) {
    return { ...base, verdict: 'gamble', text: `You gave ${gave} and got ${describe(ra, rb)}, but it does not hold: they can defend and keep the material. Bold. Next time count their best defence before you give.` };
  }
  return { ...base, verdict: 'giveaway', text: `You gave ${gave} and bought nothing: no new road, no extra attacker, no check. Material is fuel, not confetti. What did you expect to open?` };
}

function describe(a: AttackReport, b: AttackReport): string {
  const parts: string[] = [];
  const dz = a.kingZoneAttackers - b.kingZoneAttackers;
  if (dz > 0) parts.push(`${dz} more attacker${dz === 1 ? '' : 's'} on the king`);
  const dx = a.xrays.length - b.xrays.length;
  if (dx > 0) parts.push(`${dx} new road${dx === 1 ? '' : 's'} to the king`);
  if (a.givesCheck) parts.push('a check');
  if (a.mateInOne) parts.push('a mate threat');
  return parts.length ? parts.join(', ') : 'pressure';
}
