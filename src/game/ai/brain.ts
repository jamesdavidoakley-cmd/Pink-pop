import type { BossAbility, BossDef, BossTraits, GameConfig, MoveDef, MovesetDef, RangeBand } from '../../engine/types';

/**
 * The Boss Personality Framework (§6.3) — pure utility-AI decision core.
 * Personality EMERGES from five trait numbers driving move scoring; the same
 * moveset must express opposite fighters (proven by tests/ai-sim). No three.js
 * imports — this file simulates headless.
 */

export interface BrainContext {
  /** near <3m · mid 3–7m · far >7m */
  distanceBand: RangeBand;
  selfHpFrac: number;
  playerHpFrac: number;
  /** rolling histogram of the player's recent actions (§: last 12) */
  playerHabits: Record<string, number>;
  /** seconds the player has held the current distance band */
  distanceHeldSeconds: number;
  /** damage the player took in the last 10 s (rubber-banding input) */
  recentPlayerDamage: number;
}

export interface BrainDecision {
  move: MoveDef;
  firedAbilities: BossAbility[];
}

export type Rng = () => number;

const TAG_FACTORS: Record<string, (t: BossTraits) => number> = {
  strike: (t) => 0.25 + Math.pow(t.aggression, 1.3) * 1.75,
  advance: (t) => 0.4 + t.aggression * 1.2,
  // block sits low at rest so LEARNED blocking (habit adaptation) reads as
  // a visible change in behaviour rather than a saturated default
  block: (t) => 0.15 + t.caution * 0.75,
  retreat: (t) => 0.25 + t.caution * 1.25,
  reposition: (t) => 0.45 + t.caution * 0.9 + t.patience * 0.35,
  feint: (t) => 0.2 + t.trickery * 1.6,
  taunt: (t) => 0.2 + t.showmanship * 1.4,
  wait: (t) => 0.15 + t.patience * 1.5,
  ranged: (t) => 0.5 + t.caution * 0.5 + t.trickery * 0.3,
  special: () => 1,
};

export class BossBrain {
  readonly traits: BossTraits;
  private moves: MoveDef[];
  private cooldowns = new Map<string, number>();
  private lastMove: string | null = null;
  private lastMoveCount = 0;
  private fightTime = 0;
  private abilityTimers = new Map<string, number>();
  private firedOnce = new Set<string>();
  private hpBelowSeen = new Set<string>();
  /** threat spent in a rolling 10 s window: [time, cost][] */
  private threatSpent: [number, number][] = [];
  /** adaptation: total observed player actions (confidence ramps with evidence) */
  private observations = 0;
  private playerStreak = 0;
  phase = 1;

  constructor(
    readonly def: BossDef,
    moveset: MovesetDef,
    private cfg: GameConfig['bossAI'],
    private rng: Rng = Math.random,
    private difficultyThreatScale = 1,
    traitNoise = 0,
  ) {
    this.moves = moveset.moves;
    const noise = (v: number): number =>
      Math.max(0, Math.min(1, v + (this.rng() * 2 - 1) * traitNoise));
    this.traits = {
      aggression: noise(def.traits.aggression),
      caution: noise(def.traits.caution),
      trickery: noise(def.traits.trickery),
      patience: noise(def.traits.patience),
      showmanship: noise(def.traits.showmanship),
    };
  }

  /** Seconds between decisions — aggressive minds race, patient minds savour. */
  get decisionInterval(): number {
    const { decisionIntervalMin: lo, decisionIntervalMax: hi } = this.cfg;
    const base = hi - (hi - lo) * this.traits.aggression;
    return Math.max(lo, Math.min(hi, base + (this.rng() - 0.5) * 0.1));
  }

  notePlayerAction(_action: string): void {
    this.observations++;
  }

  notePlayerStreak(n: number): void { this.playerStreak = n; }

  /** Register damage the boss actually dealt (threat governor accounting). */
  noteThreatSpent(cost: number): void {
    this.threatSpent.push([this.fightTime, cost]);
  }

  enterPhase(p: number): void { this.phase = p; }

  private threatBudgetLeft(ctx: BrainContext): number {
    const cutoff = this.fightTime - 10;
    this.threatSpent = this.threatSpent.filter(([t]) => t >= cutoff);
    const spent = this.threatSpent.reduce((s, [, c]) => s + c, 0);
    let budget = this.cfg.threatBudgetPer10s * this.difficultyThreatScale;
    // rubber band: a battered player buys breathing room
    if (ctx.recentPlayerDamage >= this.cfg.rubberBandDamageThreshold) {
      budget *= this.cfg.rubberBandScale;
    }
    return budget - spent;
  }

  /** Data-driven ability triggers (§6.3) — evaluated every tick. */
  private checkAbilities(ctx: BrainContext, dt: number): BossAbility[] {
    const fired: BossAbility[] = [];
    for (const ab of this.def.abilities ?? []) {
      if (!ab.repeat && this.firedOnce.has(ab.id)) continue;
      const trig = ab.trigger;
      let fire = false;
      switch (trig.type) {
        case 'onHpBelow':
          if (ctx.selfHpFrac <= (trig.value ?? 0.5) && !this.hpBelowSeen.has(ab.id)) {
            this.hpBelowSeen.add(ab.id);
            fire = true;
          }
          break;
        case 'onTimer': {
          const t = (this.abilityTimers.get(ab.id) ?? 0) + dt;
          if (t >= (trig.value ?? 20)) {
            this.abilityTimers.set(ab.id, 0);
            fire = true;
          } else this.abilityTimers.set(ab.id, t);
          break;
        }
        case 'onPlayerStreak':
          if (this.playerStreak >= (trig.value ?? 3)) { fire = true; this.playerStreak = 0; }
          break;
        case 'onDistanceHeld':
          if (ctx.distanceBand === (trig.range ?? 'far') && ctx.distanceHeldSeconds >= (trig.seconds ?? trig.value ?? 6)) fire = true;
          break;
        case 'onPhaseEnter':
          if (this.phase >= (trig.value ?? 2) && !this.firedOnce.has(ab.id)) fire = true;
          break;
        case 'onAllyDown':
          break; // driven externally via fireAbilityNow
      }
      if (fire) {
        this.firedOnce.add(ab.id);
        fired.push(ab);
      }
    }
    return fired;
  }

  /** Habit concentration: how one-note is the player's recent play? 0–1. */
  private habitRead(ctx: BrainContext): { topAction: string | null; concentration: number } {
    const entries = Object.entries(ctx.playerHabits);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    if (total < 4) return { topAction: null, concentration: 0 };
    const [topAction, topN] = entries.reduce((a, b) => (a[1] >= b[1] ? a : b));
    return { topAction, concentration: topN / total };
  }

  score(move: MoveDef, ctx: BrainContext): number {
    let s = move.baseWeight;

    // trait multiplier: mean of factors for the move's tags
    const factors = move.tags.map((tag) => (TAG_FACTORS[tag] ?? (() => 1))(this.traits));
    s *= factors.reduce((a, b) => a + b, 0) / factors.length;

    // range-band fit
    const band = ctx.distanceBand;
    const pref = move.range ?? 'any';
    if (pref === 'any') s *= 0.85;
    else if (pref === band) s *= 1.0;
    else if ((pref === 'near' && band === 'mid') || (pref === 'mid' && band !== 'mid') || (pref === 'far' && band === 'mid')) s *= 0.35;
    else s *= 0.08;

    // low health changes minds: cautious types turtle, relentless types surge
    if (ctx.selfHpFrac < 0.35) {
      if (move.tags.includes('block') || move.tags.includes('retreat')) s *= 1 + this.traits.caution * 0.9;
      if (move.tags.includes('strike')) s *= 1 + this.traits.aggression * 0.45;
    }

    // habit adaptation (§6.3): confidence grows with observation count —
    // the boss visibly LEARNS over the fight, it doesn't start omniscient
    const { topAction, concentration } = this.habitRead(ctx);
    if (topAction && concentration > 0.4) {
      const confidence = Math.min(1, this.observations / 400);
      const isAttackHabit = topAction === 'spin' || topAction === 'stomp' || topAction === 'spit' || topAction === 'attack';
      if (isAttackHabit && move.tags.includes('block')) {
        s *= 1 + this.traits.caution * concentration * confidence * 4.0;
      }
      if (isAttackHabit && move.tags.includes('feint')) {
        s *= 1 + this.traits.trickery * concentration * confidence * 1.8;
      }
      if (topAction === 'retreat' && move.tags.includes('advance')) {
        s *= 1 + this.traits.aggression * concentration * confidence;
      }
    }

    // cooldowns
    if ((this.cooldowns.get(move.id) ?? 0) > 0) s *= 0.02;

    // ban-repeat rule: no move 3× consecutively (relentless types exempt)
    if (
      this.lastMove === move.id
      && this.lastMoveCount >= this.cfg.banRepeatCount - 1
      && this.traits.aggression <= this.cfg.banRepeatAggressionExempt
    ) s *= 0.02;

    // fairness governor: out of threat budget → attacks fade out
    if ((move.threat ?? 0) > 0 && this.threatBudgetLeft(ctx) < (move.threat ?? 0)) s *= 0.03;

    return Math.max(0.0001, s);
  }

  /** One decision tick. dt = seconds since the last decision. */
  tick(ctx: BrainContext, dt: number): BrainDecision {
    this.fightTime += dt;
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, Math.max(0, v - dt));
    const firedAbilities = this.checkAbilities(ctx, dt);

    const scored = this.moves.map((m) => ({ m, s: this.score(m, ctx) }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, this.cfg.topN);

    // softmax with trickery-scaled temperature — unpredictability is a trait
    const temperature = this.cfg.softmaxBase + this.traits.trickery * this.cfg.softmaxTrickeryScale;
    const maxS = top[0].s;
    const weights = top.map(({ s }) => Math.exp((s - maxS) / (maxS * temperature)));
    let r = this.rng() * weights.reduce((a, b) => a + b, 0);
    let chosen = top[0];
    for (let i = 0; i < top.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = top[i]; break; }
    }

    const move = chosen.m;
    if (move.cooldown) this.cooldowns.set(move.id, move.cooldown);
    if (this.lastMove === move.id) this.lastMoveCount++;
    else { this.lastMove = move.id; this.lastMoveCount = 1; }
    if ((move.threat ?? 0) > 0) this.noteThreatSpent(move.threat ?? 0);

    return { move, firedAbilities };
  }
}

/** Rolling player-habit histogram (last N actions) shared by boss + enemies. */
export class HabitTracker {
  private recent: string[] = [];
  constructor(private window = 12) {}
  add(action: string): void {
    this.recent.push(action);
    if (this.recent.length > this.window) this.recent.shift();
  }
  histogram(): Record<string, number> {
    const h: Record<string, number> = {};
    for (const a of this.recent) h[a] = (h[a] ?? 0) + 1;
    return h;
  }
}

/** Deterministic RNG for reproducible sims (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
