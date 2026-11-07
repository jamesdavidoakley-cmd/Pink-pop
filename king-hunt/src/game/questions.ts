/**
 * Question pacing. The why-questions are the lesson, but as a card on every
 * puzzle they drag. Quick mode asks when it is informative and gets out of
 * the way otherwise; the why still appears as coach text either way.
 */
export type QuestionMode = 'full' | 'quick' | 'off';

export const QUESTION_MODES: QuestionMode[] = ['quick', 'full', 'off'];
export const QUESTION_MODE_LABEL: Record<QuestionMode, string> = {
  quick: 'Questions: quick',
  full: 'Questions: every puzzle',
  off: 'Questions: off',
};

/** Ask "what is the king's problem?" before this puzzle? */
export function shouldAskWhy(mode: QuestionMode, puzzleIndexInSession: number, recentWhy: boolean[]): boolean {
  if (mode === 'off') return false;
  if (mode === 'full') return true;
  if (puzzleIndexInSession === 0) return true; // always once per sitting
  const recent = recentWhy.slice(-3);
  if (recent.some((r) => !r)) return true; // a recent miss: check understanding again
  return puzzleIndexInSession % 3 === 0;
}

/** Ask "why did that work?" after this solve? */
export function shouldAskPrinciple(mode: QuestionMode, principleRightOnRung: number, firstTry: boolean): boolean {
  if (mode === 'off') return false;
  if (mode === 'full') return true;
  if (!firstTry) return true; // he needed hints: name the idea
  return principleRightOnRung < 2; // twice right on this rung is enough
}

/** How long an auto-advancing explanation stays up. */
export function readMs(text: string, mode: QuestionMode): number {
  const words = text.split(/\s+/).length;
  const base = Math.min(6000, 900 + words * 170);
  return mode === 'quick' ? Math.round(base * 0.8) : base;
}
