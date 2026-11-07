import type { Engine, PvLine } from '../chess/engine';

/**
 * A sparring partner. Phase 0 ships one deliberately soft bot. Later phases
 * give bots personality flaws (late castler, pawn grabber, over-pusher) via
 * JSON in /content/bots so Max learns to punish specific weaknesses.
 */
export interface BotSpec {
  id: string;
  name: string;
  blurb: string;
  skillLevel: number; // Stockfish Skill Level 0..20
  depth: number;
  /** pick randomly among lines within this many centipawns of the best */
  slack: number;
  multiPv: number;
}

export const BOTS: BotSpec[] = [
  {
    id: 'pawnsworth',
    name: 'Pawnsworth',
    blurb: 'A friendly beginner. Leaves pieces lying around.',
    skillLevel: 0,
    depth: 3,
    slack: 250,
    multiPv: 4,
  },
];

function scoreOf(l: PvLine): number {
  if (l.mate !== undefined) return l.mate > 0 ? 100000 - l.mate : -100000 - l.mate;
  return l.cp ?? 0;
}

export async function pickBotMove(engine: Engine, fen: string, bot: BotSpec): Promise<string> {
  const res = await engine.search(fen, { depth: bot.depth, multiPv: bot.multiPv, skillLevel: bot.skillLevel });
  if (res.lines.length === 0) return res.best;
  const best = Math.max(...res.lines.map(scoreOf));
  const candidates = res.lines.filter((l) => best - scoreOf(l) <= bot.slack);
  // Weighted toward the better lines, but genuinely random so games differ.
  const weights = candidates.map((l) => 1 + (bot.slack - (best - scoreOf(l))) / bot.slack);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return candidates[i]!.move;
  }
  return res.best;
}
