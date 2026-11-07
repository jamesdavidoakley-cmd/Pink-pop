import { LADDER, type Rung } from '../content/ladder';
import { RECIPES, type Recipe } from '../content/recipes';
import { isUnlocked, recipeProgress, rungProgress, streak, type Progress } from '../game/progress';

/** Full-screen DOM menus that sit over the (still rendering) board. */
export class Screens {
  onPlay: (() => void) | null = null;
  onRung: ((rung: Rung, index: number) => void) | null = null;
  onRecipe: ((recipe: Recipe) => void) | null = null;

  constructor(private root: HTMLElement) {}

  hide() {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  home(progress: Progress) {
    const days = streak(progress);
    this.root.classList.remove('hidden');
    this.root.innerHTML = `
      <div class="screen home">
        <div class="logo">King Hunt</div>
        <div class="tagline">Learn to attack like Tal.</div>
        <div class="menu">
          <button class="btn big" data-act="ladder">Attack ladder</button>
          <button class="btn big" data-act="recipes">Attack recipes</button>
          <button class="btn big ghost" data-act="play">Play a game</button>
        </div>
        <div class="streak">${days > 0 ? `🔥 ${days}-day streak` : 'Hunt every day to start a streak'}</div>
      </div>`;
    this.root.querySelector('[data-act="play"]')!.addEventListener('click', () => this.onPlay?.());
    this.root.querySelector('[data-act="ladder"]')!.addEventListener('click', () => this.ladder(progress));
    this.root.querySelector('[data-act="recipes"]')!.addEventListener('click', () => this.recipes(progress));
  }

  recipes(progress: Progress) {
    this.root.classList.remove('hidden');
    const items = RECIPES.map((r) => {
      const p = recipeProgress(progress, r.id);
      const rungIdx = LADDER.rungs.findIndex((x) => x.id === r.rung);
      return `
        <button class="rung" data-id="${r.id}">
          <div class="rung-num">${p.done > 0 ? '✓' : '→'}</div>
          <div class="rung-body">
            <div class="rung-title">${r.title}</div>
            <div class="rung-idea">${r.goal}</div>
            <div class="rung-idea">Rung ${rungIdx + 1} · ${p.done > 0 ? `done ${p.done}× · ledger ${p.countRight}/${p.countAsked}` : 'not yet played'}</div>
          </div>
          <div class="rung-principle">${r.principle}</div>
        </button>`;
    }).join('');
    this.root.innerHTML = `
      <div class="screen ladder">
        <div class="screen-head"><button class="btn ghost" data-act="home">‹ Home</button><h1>Attack recipes</h1></div>
        <p class="screen-sub">Plans, not puzzles: get ready, offer the bait, count what it buys, then walk in.</p>
        <div class="rungs">${items}</div>
      </div>`;
    this.root.querySelector('[data-act="home"]')!.addEventListener('click', () => this.home(progress));
    this.root.querySelectorAll<HTMLButtonElement>('.rung').forEach((el) =>
      el.addEventListener('click', () => this.onRecipe?.(RECIPES.find((r) => r.id === el.dataset.id)!)),
    );
  }

  ladder(progress: Progress) {
    this.root.classList.remove('hidden');
    const items = LADDER.rungs
      .map((r, i) => {
        const unlocked = isUnlocked(progress, LADDER, i);
        const p = rungProgress(progress, r.id);
        const pct = Math.min(100, Math.round((p.solved / LADDER.unlockAfter) * 100));
        return `
        <button class="rung ${unlocked ? '' : 'locked'}" data-i="${i}" ${unlocked ? '' : 'disabled'}>
          <div class="rung-num">${i + 1}</div>
          <div class="rung-body">
            <div class="rung-title">${r.title}</div>
            <div class="rung-idea">${r.idea}</div>
            <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="rung-principle">${unlocked ? r.principle : '🔒'}</div>
        </button>`;
      })
      .join('');
    this.root.innerHTML = `
      <div class="screen ladder">
        <div class="screen-head"><button class="btn ghost" data-act="home">‹ Home</button><h1>Attack ladder</h1></div>
        <div class="rungs">${items}</div>
      </div>`;
    this.root.querySelector('[data-act="home"]')!.addEventListener('click', () => this.home(progress));
    this.root.querySelectorAll<HTMLButtonElement>('.rung:not(.locked)').forEach((el) =>
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        this.onRung?.(LADDER.rungs[i]!, i);
      }),
    );
  }
}
