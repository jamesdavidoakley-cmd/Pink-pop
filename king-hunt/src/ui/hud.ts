import type { AttackReport } from '../chess/attack-lens';

export interface QuestionOption {
  text: string;
  correct: boolean;
}

/**
 * The in-game overlay: attack meter, coach line, status, and modal cards
 * (rung intro, why-questions, promotion picker). All DOM, no Three.js.
 */
export class Hud {
  private meterFill: HTMLElement;
  private meterLabel: HTMLElement;
  private coach: HTMLElement;
  private status: HTMLElement;
  private title: HTMLElement;
  private actions: HTMLElement;
  private card: HTMLElement;
  onBack: (() => void) | null = null;
  /** Fires when a card opens (with its height in px) or closes (0), so the board can move out from under it. */
  onCard: ((heightPx: number) => void) | null = null;

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-top">
        <button class="btn ghost back" aria-label="Back">‹ Home</button>
        <div class="meter" aria-label="Attack meter">
          <div class="meter-fill"></div>
          <div class="meter-label">Attack 0</div>
        </div>
        <div class="title"></div>
      </div>
      <div class="card hidden"></div>
      <div class="hud-bottom">
        <div class="coach" role="status"></div>
        <div class="row">
          <div class="status"></div>
          <div class="actions"></div>
        </div>
      </div>`;
    this.meterFill = root.querySelector('.meter-fill')!;
    this.meterLabel = root.querySelector('.meter-label')!;
    this.coach = root.querySelector('.coach')!;
    this.status = root.querySelector('.status')!;
    this.title = root.querySelector('.title')!;
    this.actions = root.querySelector('.actions')!;
    this.card = root.querySelector('.card')!;
    root.querySelector('.back')!.addEventListener('click', () => this.onBack?.());
  }

  show(visible: boolean) {
    this.root.classList.toggle('hidden', !visible);
  }

  private openCard() {
    this.card.classList.remove('hidden');
    requestAnimationFrame(() => this.onCard?.(this.card.classList.contains('hidden') ? 0 : this.card.offsetHeight));
  }
  private closeCard() {
    this.card.classList.add('hidden');
    this.onCard?.(0);
  }
  setTitle(html: string) {
    this.title.innerHTML = html;
  }
  private masked = false;
  private lastReport: AttackReport | null = null;
  /** Hide the meter while a why-question is open so the board, not the HUD, gives the answer. */
  maskMeter(on: boolean) {
    this.masked = on;
    if (on) {
      this.meterFill.style.width = '0%';
      this.meterLabel.textContent = 'Look at the board…';
    } else if (this.lastReport) {
      this.setAttack(this.lastReport);
    }
  }
  setAttack(report: AttackReport) {
    this.lastReport = report;
    if (this.masked) return;
    this.meterFill.style.width = `${report.score}%`;
    this.meterFill.dataset.level = report.score >= 70 ? 'hot' : report.score >= 35 ? 'warm' : 'cool';
    this.meterLabel.textContent = report.mateInOne ? 'MATE IS ON!' : `Attack ${report.score}`;
  }
  say(lines: string[]) {
    this.coach.textContent = lines.join(' ');
    this.coach.classList.remove('pop');
    void this.coach.offsetWidth;
    this.coach.classList.add('pop');
  }
  setStatus(text: string) {
    this.status.textContent = text;
  }
  setActions(buttons: { label: string; onClick: () => void; primary?: boolean }[]) {
    this.actions.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = 'btn' + (b.primary ? '' : ' ghost');
      el.textContent = b.label;
      el.addEventListener('click', b.onClick);
      this.actions.appendChild(el);
    }
  }

  private cardTimer: number | null = null;

  /**
   * A full-width card with a title, body and one button. Resolves when dismissed.
   * With `autoMs` it also dismisses itself (a thin bar shows the time left).
   */
  showCard(opts: { kicker?: string; title: string; body: string; button: string; autoMs?: number }): Promise<void> {
    return new Promise((resolve) => {
      if (this.cardTimer) window.clearTimeout(this.cardTimer);
      this.card.innerHTML = `
        ${opts.kicker ? `<div class="kicker">${opts.kicker}</div>` : ''}
        <h2>${opts.title}</h2>
        <p>${opts.body}</p>
        <button class="btn">${opts.button}</button>
        ${opts.autoMs ? `<div class="auto"><div class="auto-fill" style="animation-duration:${opts.autoMs}ms"></div></div>` : ''}`;
      this.openCard();
      const done = () => {
        if (this.cardTimer) window.clearTimeout(this.cardTimer);
        this.cardTimer = null;
        this.closeCard();
        resolve();
      };
      this.card.querySelector('button')!.addEventListener('click', done);
      if (opts.autoMs) this.cardTimer = window.setTimeout(done, opts.autoMs);
    });
  }

  /** A multiple-choice why-question. Resolves with the chosen option's index, or -1 if skipped. */
  ask(prompt: string, options: QuestionOption[], kicker = 'Why?', skipLabel: string | null = 'Skip'): Promise<number> {
    return new Promise((resolve) => {
      if (this.cardTimer) window.clearTimeout(this.cardTimer);
      this.card.innerHTML = `
        <div class="kicker">${kicker}</div>
        <h2>${prompt}</h2>
        <div class="options"></div>
        ${skipLabel ? `<button class="skip">${skipLabel}</button>` : ''}`;
      const box = this.card.querySelector('.options')!;
      options.forEach((o, i) => {
        const el = document.createElement('button');
        el.className = 'btn option';
        el.textContent = o.text;
        el.addEventListener('click', () => {
          this.closeCard();
          resolve(i);
        });
        box.appendChild(el);
      });
      this.card.querySelector('.skip')?.addEventListener('click', () => {
        this.closeCard();
        resolve(-1);
      });
      this.openCard();
    });
  }

  /** Promotion picker. Resolves with the chosen piece letter. */
  pickPromotion(): Promise<'q' | 'r' | 'b' | 'n'> {
    return new Promise((resolve) => {
      this.card.innerHTML = `<div class="kicker">Promote</div><h2>Your pawn becomes a…</h2><div class="options row-options"></div>`;
      const box = this.card.querySelector('.options')!;
      const names: [('q' | 'r' | 'b' | 'n'), string][] = [['q', '♕ Queen'], ['r', '♖ Rook'], ['b', '♗ Bishop'], ['n', '♘ Knight']];
      for (const [p, label] of names) {
        const el = document.createElement('button');
        el.className = 'btn option';
        el.textContent = label;
        el.addEventListener('click', () => {
          this.closeCard();
          resolve(p);
        });
        box.appendChild(el);
      }
      this.openCard();
    });
  }

  hideCard() {
    this.closeCard();
  }
}
