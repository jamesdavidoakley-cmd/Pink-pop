import type { Ladder } from '../content/ladder';
import type { QuestionMode } from './questions';

export interface RungProgress {
  solved: number;
  firstTry: number;
  revealed: number;
  attempts: number;
  /** "why did that work?" answered right on this rung */
  principleRight: number;
}

export interface Settings {
  questions: QuestionMode;
  sound: boolean;
}

export interface RecipeProgress {
  done: number;
  countRight: number; // payoff ("what do you get?") answers right
  countAsked: number;
}

export interface ReplayProgress {
  done: number;
  guessedFirst: number;
  asked: number;
}

/** Today's 15-minute hunt: which steps are done, so it can be resumed. */
export interface Today {
  date: string;
  steps: string[]; // 'warmup' | 'hunt' | 'plan' | 'spar' | 'wrap'
  puzzles: number;
  firstTry: number;
  startedAt: number; // epoch ms
}

export interface Progress {
  version: 1;
  rungs: Record<string, RungProgress>;
  recipes: Record<string, RecipeProgress>;
  replays: Record<string, ReplayProgress>;
  today: Today | null;
  settings: Settings;
  /** last few diagnosis-question results, newest last */
  whyRecent: boolean[];
  /** ISO dates (YYYY-MM-DD) of days with at least one solve */
  days: string[];
  /** diagnosis / principle questions: right vs asked */
  whyRight: number;
  whyAsked: number;
}

export const EMPTY_PROGRESS: Progress = { version: 1, rungs: {}, recipes: {}, replays: {}, today: null, settings: { questions: 'quick', sound: true }, whyRecent: [], days: [], whyRight: 0, whyAsked: 0 };

export function rungProgress(p: Progress, id: string): RungProgress {
  const r = p.rungs[id];
  if (!r) return { solved: 0, firstTry: 0, revealed: 0, attempts: 0, principleRight: 0 };
  return { ...r, principleRight: r.principleRight ?? 0 }; // older saves predate principleRight
}

export function isUnlocked(p: Progress, ladder: Ladder, index: number): boolean {
  if (index <= 0) return true;
  const prev = ladder.rungs[index - 1];
  if (!prev) return false;
  return rungProgress(p, prev.id).solved >= ladder.unlockAfter;
}

export function currentRungIndex(p: Progress, ladder: Ladder): number {
  let i = 0;
  while (i + 1 < ladder.rungs.length && isUnlocked(p, ladder, i + 1)) i++;
  return i;
}

export function recordSolve(p: Progress, rungId: string, opts: { firstTry: boolean; revealed: boolean }, today = isoToday()): Progress {
  const r = { ...rungProgress(p, rungId) };
  r.attempts++;
  r.solved++;
  if (opts.firstTry) r.firstTry++;
  if (opts.revealed) r.revealed++;
  const days = p.days.includes(today) ? p.days : [...p.days, today];
  return { ...p, rungs: { ...p.rungs, [rungId]: r }, days };
}

export function recipeProgress(p: Progress, id: string): RecipeProgress {
  return p.recipes[id] ?? { done: 0, countRight: 0, countAsked: 0 };
}

export function recordRecipe(p: Progress, id: string, countRight: number, countAsked: number, today = isoToday()): Progress {
  const r = recipeProgress(p, id);
  const days = p.days.includes(today) ? p.days : [...p.days, today];
  return { ...p, days, recipes: { ...p.recipes, [id]: { done: r.done + 1, countRight: r.countRight + countRight, countAsked: r.countAsked + countAsked } } };
}

export function replayProgress(p: Progress, id: string): ReplayProgress {
  return p.replays[id] ?? { done: 0, guessedFirst: 0, asked: 0 };
}

export function recordReplay(p: Progress, id: string, guessedFirst: number, asked: number, today = isoToday()): Progress {
  const r = replayProgress(p, id);
  const days = p.days.includes(today) ? p.days : [...p.days, today];
  return { ...p, days, replays: { ...p.replays, [id]: { done: r.done + 1, guessedFirst: r.guessedFirst + guessedFirst, asked: r.asked + asked } } };
}

export function todayFor(p: Progress, date = isoToday()): Today {
  return p.today && p.today.date === date ? p.today : { date, steps: [], puzzles: 0, firstTry: 0, startedAt: Date.now() };
}

export function recordTodayStep(p: Progress, step: string, extra: Partial<Pick<Today, 'puzzles' | 'firstTry'>> = {}, date = isoToday()): Progress {
  const t = todayFor(p, date);
  const steps = t.steps.includes(step) ? t.steps : [...t.steps, step];
  return { ...p, today: { ...t, steps, puzzles: t.puzzles + (extra.puzzles ?? 0), firstTry: t.firstTry + (extra.firstTry ?? 0) } };
}

export function recordWhy(p: Progress, right: boolean): Progress {
  const whyRecent = [...(p.whyRecent ?? []), right].slice(-5);
  return { ...p, whyRecent, whyAsked: p.whyAsked + 1, whyRight: p.whyRight + (right ? 1 : 0) };
}

export function recordPrinciple(p: Progress, rungId: string, right: boolean): Progress {
  const r = rungProgress(p, rungId);
  return recordWhy({ ...p, rungs: { ...p.rungs, [rungId]: { ...r, principleRight: r.principleRight + (right ? 1 : 0) } } }, right);
}

export function setQuestions(p: Progress, questions: QuestionMode): Progress {
  return { ...p, settings: { ...p.settings, questions } };
}

export function setSound(p: Progress, sound: boolean): Progress {
  return { ...p, settings: { ...p.settings, sound } };
}

/** Consecutive days ending today or yesterday. */
export function streak(p: Progress, today = isoToday()): number {
  const set = new Set(p.days);
  let d = new Date(today + 'T00:00:00Z');
  if (!set.has(today)) d = new Date(d.getTime() - 86400000);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) {
    n++;
    d = new Date(d.getTime() - 86400000);
  }
  return n;
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

const KEY = 'king-hunt.progress.v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROGRESS;
    const p = JSON.parse(raw) as Progress;
    return p.version === 1 ? { ...EMPTY_PROGRESS, ...p, settings: { ...EMPTY_PROGRESS.settings, ...(p.settings ?? {}) } } : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode or quota: progress is session-only */
  }
}
