import type { Ladder } from '../content/ladder';

export interface RungProgress {
  solved: number;
  firstTry: number;
  revealed: number;
  attempts: number;
}

export interface RecipeProgress {
  done: number;
  countRight: number; // payoff ("what do you get?") answers right
  countAsked: number;
}

export interface Progress {
  version: 1;
  rungs: Record<string, RungProgress>;
  recipes: Record<string, RecipeProgress>;
  /** ISO dates (YYYY-MM-DD) of days with at least one solve */
  days: string[];
  /** diagnosis / principle questions: right vs asked */
  whyRight: number;
  whyAsked: number;
}

export const EMPTY_PROGRESS: Progress = { version: 1, rungs: {}, recipes: {}, days: [], whyRight: 0, whyAsked: 0 };

export function rungProgress(p: Progress, id: string): RungProgress {
  return p.rungs[id] ?? { solved: 0, firstTry: 0, revealed: 0, attempts: 0 };
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

export function recordWhy(p: Progress, right: boolean): Progress {
  return { ...p, whyAsked: p.whyAsked + 1, whyRight: p.whyRight + (right ? 1 : 0) };
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
    return p.version === 1 ? { ...EMPTY_PROGRESS, ...p } : EMPTY_PROGRESS;
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
