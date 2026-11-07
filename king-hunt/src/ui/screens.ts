import { LADDER, type Rung } from '../content/ladder';
import { RECIPES, type Recipe } from '../content/recipes';
import { REPLAYS, type Replay } from '../content/replays';
import { isUnlocked, recipeProgress, replayProgress, rungProgress, streak, type Progress } from '../game/progress';
import { QUESTION_MODES, QUESTION_MODE_LABEL } from '../game/questions';

/** Full-screen DOM menus that sit over the (still rendering) board. */
export class Screens {
  onPlay: (() => void) | null = null;
  onRung: ((rung: Rung, index: number) => void) | null = null;
  onRecipe: ((recipe: Recipe) => void) | null = null;
  onReplay: ((replay: Replay) => void) | null = null;
  onDaily: (() => void) | null = null;
  onQuestions: ((mode: (typeof QUESTION_MODES)[number]) => void) | null = null;
  onSound: ((on: boolean) => void) | null = null;
  onCinema: ((level: 'full' | 'light' | 'off') => void) | null = null;

  constructor(private root: HTMLElement) {}

  hide() {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  home(progress: Progress, daily: { dailyDone: boolean; dailyStarted: boolean } = { dailyDone: false, dailyStarted: false }) {
    const days = streak(progress);
    const dailyLabel = daily.dailyDone ? "Today's hunt ✓ (play again)" : daily.dailyStarted ? "Continue today's hunt" : "Today's hunt · 15 min";
    this.root.classList.remove('hidden');
    this.root.innerHTML = `
      <div class="screen home">
        <div class="logo">King Hunt</div>
        <div class="tagline">Learn to attack like Tal.</div>
        <div class="menu">
          <button class="btn big hot" data-act="daily">${dailyLabel}</button>
          <button class="btn big" data-act="ladder">Attack ladder</button>
          <button class="btn big" data-act="recipes">Attack recipes</button>
          <button class="btn big" data-act="replays">Great hunts</button>
          <button class="btn big ghost" data-act="play">Play a game</button>
        </div>
        <div class="streak">${days > 0 ? `🔥 ${days}-day streak` : 'Hunt every day to start a streak'}</div>
        <div class="toggles">
          <button class="mode-toggle" data-act="questions" title="Quick asks the why-questions only when they teach something; every puzzle asks always; off never asks but still explains.">${QUESTION_MODE_LABEL[progress.settings.questions]}</button>
          <button class="mode-toggle" data-act="sound">${progress.settings.sound ? 'Sound: on' : 'Sound: off'}</button>
          <button class="mode-toggle" data-act="cinema" title="Full: cut scenes and camera dives. Light: effects, camera stays put. Off: none.">${{ full: 'Cinema: full', light: 'Cinema: light', off: 'Cinema: off' }[progress.settings.cinema ?? 'full']}</button>
        </div>
      </div>`;
    this.root.querySelector('[data-act="sound"]')!.addEventListener('click', () => this.onSound?.(!progress.settings.sound));
    this.root.querySelector('[data-act="cinema"]')!.addEventListener('click', () => {
      const order = ['full', 'light', 'off'] as const;
      const i = order.indexOf(progress.settings.cinema ?? 'full');
      this.onCinema?.(order[(i + 1) % order.length]!);
    });
    this.root.querySelector('[data-act="questions"]')!.addEventListener('click', () => {
      const i = QUESTION_MODES.indexOf(progress.settings.questions);
      this.onQuestions?.(QUESTION_MODES[(i + 1) % QUESTION_MODES.length]!);
    });
    this.root.querySelector('[data-act="play"]')!.addEventListener('click', () => this.onPlay?.());
    this.root.querySelector('[data-act="ladder"]')!.addEventListener('click', () => this.ladder(progress));
    this.root.querySelector('[data-act="recipes"]')!.addEventListener('click', () => this.recipes(progress));
    this.root.querySelector('[data-act="replays"]')!.addEventListener('click', () => this.replays(progress));
    this.root.querySelector('[data-act="daily"]')!.addEventListener('click', () => this.onDaily?.());
  }

  replays(progress: Progress) {
    this.root.classList.remove('hidden');
    const items = REPLAYS.map((r) => {
      const p = replayProgress(progress, r.id);
      return `
        <button class="rung" data-id="${r.id}">
          <div class="rung-num">${p.done > 0 ? '✓' : '→'}</div>
          <div class="rung-body">
            <div class="rung-title">${r.title}</div>
            <div class="rung-idea">${r.hero} vs ${r.opponent}, ${r.where} ${r.year}</div>
            <div class="rung-idea">${p.done > 0 ? `watched ${p.done}× · found ${p.guessedFirst}/${p.asked} key moves first time` : `${Object.keys(r.asks).length} moves to find`}</div>
          </div>
          <div class="rung-principle">${r.hero.split(' ').pop()}</div>
        </button>`;
    }).join('');
    this.root.innerHTML = `
      <div class="screen ladder">
        <div class="screen-head"><button class="btn ghost" data-act="home">‹ Home</button><h1>Great hunts</h1></div>
        <p class="screen-sub">Play the famous attacks move by move. At the big moments, you find the move, and every move tells you why.</p>
        <div class="rungs">${items}</div>
      </div>`;
    this.root.querySelector('[data-act="home"]')!.addEventListener('click', () => this.home(progress));
    this.root.querySelectorAll<HTMLButtonElement>('.rung').forEach((el) =>
      el.addEventListener('click', () => this.onReplay?.(REPLAYS.find((r) => r.id === el.dataset.id)!)),
    );
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
