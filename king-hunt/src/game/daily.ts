import type { App } from './app';
import { LADDER } from '../content/ladder';
import { RECIPES } from '../content/recipes';
import { PRINCIPLE_WHY } from '../content/ladder';
import { currentRungIndex, recipeProgress, recordTodayStep, streak, todayFor } from './progress';

/**
 * Today's hunt: the 15-minute daily session.
 *   warm-up (the rung's idea and why) → hunt (three puzzles) →
 *   plan (a recipe for the rung, if one is left) or spar (a game vs the rung's bot) → wrap.
 * Each step is recorded so the session resumes where it stopped.
 */
export type DailyStep = 'warmup' | 'hunt' | 'plan' | 'spar' | 'wrap';
export const HUNT_PUZZLES = 3;

export class Daily {
  constructor(private app: App) {}

  rung() {
    return LADDER.rungs[currentRungIndex(this.app.progress, LADDER)]!;
  }

  /** The recipe for today's rung that has been played least, or null if none exists. */
  recipeForToday() {
    const r = this.rung();
    const list = RECIPES.filter((x) => x.rung === r.id);
    if (list.length === 0) return null;
    return [...list].sort((a, b) => recipeProgress(this.app.progress, a.id).done - recipeProgress(this.app.progress, b.id).done)[0]!;
  }

  nextStep(): DailyStep {
    const t = todayFor(this.app.progress);
    if (!t.steps.includes('warmup')) return 'warmup';
    if (!t.steps.includes('hunt')) return 'hunt';
    // Alternate: plan on even solve-days, spar on odd, and only plan when a recipe exists.
    const planDay = this.app.progress.days.length % 2 === 0 && this.recipeForToday() !== null;
    if (planDay && !t.steps.includes('plan')) return 'plan';
    if (!planDay && !t.steps.includes('spar')) return 'spar';
    return 'wrap';
  }

  isDone() {
    return todayFor(this.app.progress).steps.includes('wrap');
  }

  minutes() {
    return Math.round((Date.now() - todayFor(this.app.progress).startedAt) / 60000);
  }

  private mark(step: DailyStep, extra: { puzzles?: number; firstTry?: number } = {}) {
    this.app.setProgress(recordTodayStep(this.app.progress, step, extra));
  }

  async run(): Promise<void> {
    if (!this.app.progress.today || this.app.progress.today.date !== todayFor(this.app.progress).date) {
      this.app.setProgress({ ...this.app.progress, today: todayFor(this.app.progress) });
    }
    const step = this.nextStep();
    const rung = this.rung();
    switch (step) {
      case 'warmup': {
        this.app.showHudOnly();
        await this.app.hud.showCard({
          kicker: `Today's hunt · warm-up · rung ${LADDER.rungs.indexOf(rung) + 1}`,
          title: rung.title,
          body: `${rung.idea}<br><br><b>Why it works:</b> ${rung.why}<br><br><b>${rung.principle}:</b> ${PRINCIPLE_WHY[rung.principle]}`,
          button: `Hunt: ${HUNT_PUZZLES} puzzles`,
        });
        this.mark('warmup');
        return this.run();
      }
      case 'hunt': {
        const s = await this.app.goPuzzle(LADDER.rungs.indexOf(rung), { targetSolves: HUNT_PUZZLES, skipIntro: true });
        if (!s) return;
        s.onComplete = (solved, firstTries) => {
          this.mark('hunt', { puzzles: solved, firstTry: firstTries });
          void this.run();
        };
        return;
      }
      case 'plan': {
        const recipe = this.recipeForToday()!;
        const s = await this.app.goRecipe(recipe.id);
        if (!s) return;
        s.onFinished = () => {
          this.mark('plan');
          void this.run();
        };
        return;
      }
      case 'spar': {
        const s = this.app.goPlay({ label: 'Spar' });
        s.onGameOver = () => {
          this.mark('spar');
          void this.run();
        };
        return;
      }
      case 'wrap': {
        const t = todayFor(this.app.progress);
        this.mark('wrap');
        this.app.showHudOnly();
        const days = streak(this.app.progress);
        await this.app.hud.showCard({
          kicker: `Today's hunt · done in about ${Math.max(1, this.minutes())} min`,
          title: days > 1 ? `${days} days in a row` : 'Hunt complete',
          body: `Puzzles solved: ${t.puzzles} (${t.firstTry} first try).<br>Rung: ${rung.title}.<br><br><b>Tomorrow:</b> ${this.tomorrowLine()}`,
          button: 'Home',
        });
        this.app.goHome();
        return;
      }
    }
  }

  private tomorrowLine() {
    const r = this.rung();
    const left = Math.max(0, LADDER.unlockAfter - (this.app.progress.rungs[r.id]?.solved ?? 0));
    if (left > 0) return `${left} more solves on "${r.title}" unlock the next rung.`;
    const next = LADDER.rungs[LADDER.rungs.indexOf(r) + 1];
    return next ? `A new rung: ${next.title}.` : 'You have climbed the whole ladder. Hunt for fun.';
  }
}
