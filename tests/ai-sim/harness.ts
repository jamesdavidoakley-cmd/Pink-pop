import { loadContent } from '../../src/engine/loader';
import { BossBrain, HabitTracker, seededRng, type BrainContext } from '../../src/game/ai/brain';
import type { RangeBand } from '../../src/engine/types';

/**
 * Headless fight simulator for the §6.6 AI proofs. A scripted player-bot
 * feeds the brain a plausible evolving context; we record every decision.
 */

export interface PlayerBot {
  /** action fed into the habit tracker each tick (what the "player" does) */
  act(tick: number): string;
  /** how the player manages distance */
  preferredDistance(tick: number): number;
}

export const spamSpinBot: PlayerBot = {
  act: () => 'spin',
  preferredDistance: () => 2.2,
};

export const mixedBot: PlayerBot = {
  act: (t) => ['spin', 'stomp', 'move', 'jump', 'spit', 'move'][t % 6],
  preferredDistance: (t) => 2 + (t % 7),
};

export interface SimResult {
  actions: string[];
  tagCounts: Record<string, number>;
  abilityFires: { id: string; atTime: number; atHp: number }[];
  /** tag share within a tick range */
  shareOf(tags: string[], from?: number, to?: number): number;
}

export interface SimOptions {
  ticks?: number;
  seed?: number;
  bot?: PlayerBot;
  /** selfHp over time: fraction as a function of tick (default: slow burn) */
  hpSchedule?: (tick: number, total: number) => number;
  threatScale?: number;
  traitNoise?: number;
}

export function simulate(bossId: string, opts: SimOptions = {}): SimResult {
  const content = loadContent();
  const boss = content.bosses[bossId];
  if (!boss) throw new Error(`no boss ${bossId}`);
  const moveset = content.movesets[boss.moveset];
  const ticks = opts.ticks ?? 500;
  const rng = seededRng(opts.seed ?? 1234);
  const bot = opts.bot ?? mixedBot;
  const hpAt = opts.hpSchedule ?? ((t, total) => Math.max(0.05, 1 - (t / total) * 0.9));
  const brain = new BossBrain(boss, moveset, content.config.bossAI, rng, opts.threatScale ?? 1, opts.traitNoise ?? 0);
  const habits = new HabitTracker(content.config.bossAI.habitWindow);

  const actions: string[] = [];
  const tagCounts: Record<string, number> = {};
  const abilityFires: { id: string; atTime: number; atHp: number }[] = [];
  const tickTags: string[][] = [];

  let distance = 6;
  let distanceHeld = 0;
  let lastBand: RangeBand = 'mid';
  let time = 0;

  for (let i = 0; i < ticks; i++) {
    const dt = brain.decisionInterval;
    time += dt;
    habits.add(bot.act(i));
    brain.notePlayerAction(bot.act(i));

    // player drifts toward preferred distance; boss motion pulls too
    const want = bot.preferredDistance(i);
    distance += (want - distance) * 0.3;

    const band: RangeBand = distance < 3 ? 'near' : distance <= 7 ? 'mid' : 'far';
    if (band === lastBand) distanceHeld += dt;
    else { distanceHeld = 0; lastBand = band; }

    const ctx: BrainContext = {
      distanceBand: band,
      selfHpFrac: hpAt(i, ticks),
      playerHpFrac: 0.8,
      playerHabits: habits.histogram(),
      distanceHeldSeconds: distanceHeld,
      recentPlayerDamage: 0,
    };
    const { move, firedAbilities } = brain.tick(ctx, dt);
    actions.push(move.id);
    tickTags.push(move.tags);
    for (const tag of move.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    for (const ab of firedAbilities) abilityFires.push({ id: ab.id, atTime: time, atHp: ctx.selfHpFrac });

    // boss motion nudges distance
    if (move.motion?.kind === 'approach' || move.motion?.kind === 'lunge' || move.motion?.kind === 'leap') distance = Math.max(1.2, distance - 2.4);
    if (move.motion?.kind === 'retreat' || move.motion?.kind === 'vanishStep') distance += 2.2;
  }

  return {
    actions,
    tagCounts,
    abilityFires,
    shareOf(tags: string[], from = 0, to = actions.length): number {
      let hits = 0;
      for (let i = from; i < Math.min(to, actions.length); i++) {
        if (tickTags[i].some((t) => tags.includes(t))) hits++;
      }
      return hits / Math.max(1, Math.min(to, actions.length) - from);
    },
  };
}
