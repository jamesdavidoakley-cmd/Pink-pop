import type { Content } from '../../engine/loader';
import type { QuestionDef, QuestionPack } from '../../engine/types';
import type { Session } from '../session';
import { bus } from '../../engine/events';
import { evalExpr } from './expr';

/**
 * The education engine (§5): adaptive question instancing, the warm failure
 * loop, mastery XP, and weakest-topic selection for spaced repetition.
 * Pure logic — presentation (pads, panels, speech) is injected per ask.
 */

export interface QuestionInstance {
  def: QuestionDef;
  topicId: string;
  tier: number;
  text: string;
  choices: string[];
  correctIndex: number;
  hint: string;
  explain: string;
  askStyles: string[];
}

export interface AskPresenter {
  /** Show the question + choices; resolve with the picked index. */
  present(q: QuestionInstance, attempt: number): Promise<number>;
  /** Feedback moments (visual only — speech is the engine's job). */
  onCorrect(): void;
  onIncorrect(): void;
  dispose(): void;
}

export interface AskVoice {
  say(charId: string, poolKey: string, vars?: Record<string, string | number>): Promise<void>;
  sayText(charId: string, text: string): Promise<void>;
  pickAskSpeaker(askStyles: string[]): string;
}

export type AskResult = 'first_try' | 'after_hint' | 'taught';

export class EducationEngine {
  /** The question currently being asked (drives dev tools + tests). */
  lastQuestion: QuestionInstance | null = null;

  constructor(private content: Content, private session: Session) {}

  // ---------------- selection ----------------
  packsFor(topicId: string): QuestionPack[] {
    return Object.values(this.content.questions).filter((p) => p.topic === topicId);
  }

  topics(): string[] {
    return [...new Set(Object.values(this.content.questions).map((p) => p.topic))];
  }

  /** Current adaptive tier for a topic (tasks scale their rules with this). */
  tierFor(topicId: string): number {
    return this.session.topic(topicId).tier;
  }

  /** Weakest-topic-weighted pick (Quiz Orbs, café games, loading facts). */
  pickWeakTopic(candidates?: string[]): string {
    const pool = (candidates && candidates.length ? candidates : this.topics())
      .filter((t) => this.packsFor(t).length > 0);
    if (!pool.length) return 'place-value';
    const w = this.content.config.education.weakTopicWeight;
    const weights = pool.map((t) => 1 + (3 - this.session.stars(t)) * w);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /** Build a concrete question at the player's adaptive tier for a topic. */
  makeQuestion(topicId: string, tierOverride?: number): QuestionInstance | null {
    const packs = this.packsFor(topicId);
    if (!packs.length) return null;
    const tier = tierOverride ?? this.session.topic(topicId).tier;
    const all = packs.flatMap((p) => p.questions);
    let candidates = all.filter((q) => q.tier === tier);
    if (!candidates.length) candidates = all.filter((q) => Math.abs(q.tier - tier) === 1);
    if (!candidates.length) candidates = all;
    const def = candidates[Math.floor(Math.random() * candidates.length)];
    return this.instantiate(def, topicId, tier);
  }

  instantiate(def: QuestionDef, topicId: string, tier: number): QuestionInstance {
    const vars: Record<string, number> = {};
    for (const [name, p] of Object.entries(def.params ?? {})) {
      const step = p.multipleOf ?? 1;
      const lo = Math.ceil(p.min / step), hi = Math.floor(p.max / step);
      vars[name] = (lo + Math.floor(Math.random() * (hi - lo + 1))) * step;
    }
    let choices: string[];
    let correctIndex: number;
    if (def.answerExpr) {
      const answer = evalExpr(def.answerExpr, vars);
      vars.answer = answer;
      const distractors = new Set<number>();
      for (const rule of def.distractorRules ?? []) {
        try {
          const d = evalExpr(rule, vars);
          if (d !== answer && Number.isFinite(d) && d >= 0) distractors.add(d);
        } catch { /* skip bad rule for this roll */ }
      }
      // top up with nearby-but-wrong values if rules collided
      let bump = 1;
      while (distractors.size < 2) {
        const d = answer + (distractors.size % 2 === 0 ? bump : -bump);
        if (d !== answer && d >= 0) distractors.add(d);
        bump++;
      }
      const opts = [answer, ...[...distractors].slice(0, 2)];
      shuffle(opts);
      correctIndex = opts.indexOf(answer);
      choices = opts.map((o) => fmtNum(o));
    } else {
      const opts = (def.choices ?? []).map(String);
      const answer = opts[def.answerIndex ?? 0];
      const picked = [answer, ...shuffle(opts.filter((_, i) => i !== (def.answerIndex ?? 0))).slice(0, 2)];
      shuffle(picked);
      correctIndex = picked.indexOf(answer);
      choices = picked;
    }
    // derived vars for templates: {a2} = a doubled, {answer}
    const tplVars: Record<string, string | number> = { ...vars };
    for (const [k, v] of Object.entries(vars)) tplVars[`${k}2`] = v * 2;
    return {
      def, topicId, tier,
      text: interp(def.template, tplVars),
      choices,
      correctIndex,
      hint: interp(def.hint, tplVars),
      explain: interp(def.explain, tplVars),
      askStyles: def.askStyles,
    };
  }

  /**
   * The full spoken ask (§5.1 laws): intro line → spoken question → answer →
   * warm failure loop (gentle line + hint → retry → teach + fresh numbers).
   * Resolves once the player has succeeded (possibly on regenerated values).
   */
  async ask(topicId: string, presenter: AskPresenter, voice: AskVoice, opts: { tier?: number; intro?: boolean } = {}): Promise<AskResult> {
    let q = this.makeQuestion(topicId, opts.tier);
    if (!q) return 'first_try';
    this.lastQuestion = q;
    const speaker = voice.pickAskSpeaker(q.askStyles);
    bus.emit('QuestionAsked', { topicId, tier: q.tier, questionId: q.def.id });
    if (opts.intro !== false) await voice.say(speaker, 'ask_intro', { topic: topicId });
    await voice.sayText(speaker, q.text);

    let attempt = 0;
    let result: AskResult = 'first_try';
    for (;;) {
      const picked = await presenter.present(q, attempt);
      const correct = picked === q.correctIndex;
      if (correct) {
        presenter.onCorrect();
        this.recordAnswer(topicId, true, q.tier, result === 'first_try');
        await voice.say(speaker, result === 'first_try' ? 'correct_first_try' : 'correct_after_hint');
        this.maybeStreakLine(speaker, voice);
        return result;
      }
      presenter.onIncorrect();
      attempt++;
      if (attempt === 1) {
        result = 'after_hint';
        this.recordAnswer(topicId, false, q.tier, true);
        await voice.say(speaker, 'incorrect_gentle');
        await voice.say(speaker, 'hint_quickfire', { hint: q.hint });
      } else {
        // second miss: teach step by step, then fresh numbers — never a dead end
        result = 'taught';
        this.recordAnswer(topicId, false, q.tier, false);
        await voice.say(speaker, 'teach', { explain: q.explain });
        q = this.makeQuestion(topicId, q.tier) ?? q;
        this.lastQuestion = q;
        await voice.sayText(speaker, q.text);
        attempt = 0;
      }
    }
  }

  private streak = 0;

  private maybeStreakLine(speaker: string, voice: AskVoice): void {
    if (this.streak === 3) void voice.say(speaker, 'streak_3');
    else if (this.streak === 5) void voice.say(speaker, 'streak_5');
  }

  /** Adaptive tiers + mastery XP. Public so tests can drive it directly. */
  recordAnswer(topicId: string, correct: boolean, tier: number, firstTry: boolean): void {
    const cfg = this.content.config.education;
    const t = this.session.topic(topicId);
    t.attempts++;
    const starsBefore = this.session.stars(topicId);
    if (correct) {
      t.correct++;
      t.streak++;
      t.recentMisses = Math.max(0, t.recentMisses - 1);
      this.streak++;
      t.xp += firstTry ? cfg.xpFirstTry : cfg.xpAfterHint;
      if (t.streak >= cfg.promoteStreak && t.tier < cfg.tierMax) {
        t.tier++;
        t.streak = 0;
      }
    } else {
      t.streak = 0;
      this.streak = 0;
      t.recentMisses++;
      t.xp += 0; // no XP loss, ever — kindness law
      if (t.recentMisses >= cfg.demoteMisses && t.tier > cfg.tierMin) {
        t.tier--;         // soft, invisible demotion
        t.recentMisses = 0;
      }
    }
    bus.emit('QuestionAnswered', { topicId, correct, tier, firstTry });
    const starsAfter = this.session.stars(topicId);
    if (starsAfter !== starsBefore) {
      bus.emit('MasteryChanged', { topicId, stars: starsAfter, xp: t.xp });
    }
    this.session.save();
  }

  /** XP for completing a taught pass (kindness: showing up earns something). */
  awardTaughtXp(topicId: string): void {
    this.session.topic(topicId).xp += this.content.config.education.xpTaught;
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-GB');
  return String(Math.round(n * 100) / 100);
}

function interp(text: string, vars: Record<string, string | number>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, typeof v === 'number' ? fmtNum(v) : v);
  }
  return out;
}
