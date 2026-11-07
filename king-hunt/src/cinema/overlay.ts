/**
 * DOM layer for cut scenes: letterbox bars, title cards, a full-screen flash
 * and a "tap to skip" affordance. Pure presentation; the director drives timing.
 */
export class CinemaOverlay {
  private root: HTMLElement;
  private title: HTMLElement;
  private flashEl: HTMLElement;
  onSkip: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'cinema';
    this.root.innerHTML = `
      <div class="bar top"></div><div class="bar bottom"></div>
      <div class="flash"></div>
      <div class="title"><div class="kicker"></div><div class="big"></div><div class="sub"></div></div>
      <div class="caption"></div>
      <div class="skip-hint">tap to skip</div>`;
    parent.appendChild(this.root);
    this.title = this.root.querySelector('.title')!;
    this.flashEl = this.root.querySelector('.flash')!;
    this.root.addEventListener('pointerdown', () => this.onSkip?.());
  }

  letterbox(on: boolean) {
    this.root.classList.toggle('letterbox', on);
    this.root.classList.toggle('active', on);
  }

  /** Big typographic title that slams in; resolves after `ms` or stays if ms = 0. */
  showTitle(big: string, kicker = '', sub = '', ms = 1800): Promise<void> {
    this.title.querySelector('.kicker')!.textContent = kicker;
    this.title.querySelector('.big')!.textContent = big;
    this.title.querySelector('.sub')!.textContent = sub;
    this.title.classList.remove('in');
    void this.title.offsetWidth;
    this.title.classList.add('in');
    return new Promise((r) => {
      if (!ms) return r();
      window.setTimeout(() => {
        this.hideTitle();
        r();
      }, ms);
    });
  }
  hideTitle() {
    this.title.classList.remove('in');
  }

  /** White or coloured full-screen flash that fades. */
  flash(color = 'rgba(255,255,255,.85)', ms = 260) {
    this.flashEl.style.background = color;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '1';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = `opacity ${ms}ms ease-out`;
    this.flashEl.style.opacity = '0';
  }

  /** Lower-third caption during a sequence; empty string hides it. */
  caption(text: string) {
    const el = this.root.querySelector('.caption') as HTMLElement;
    el.textContent = text;
    el.classList.toggle('in', !!text);
    if (text) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  }

  /** Red edge pulse (check, danger). */
  danger() {
    this.root.classList.remove('danger');
    void this.root.offsetWidth;
    this.root.classList.add('danger');
  }
}
