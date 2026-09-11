// All the DOM. The game talks to this; this never touches three.js.
import { PLACE_NAMES, BLOCK_NAMES, type Place } from './number';
import { MODES, TIERS, MODE_INFO, tierLabel, type Mode, type Tier } from './levels';
import { levelKey, type SaveData } from './save';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface ColumnButtons { add: boolean; sub: boolean; smash: boolean }

export class Hud {
  private cols: HTMLElement[] = [];
  private counts: HTMLElement[] = [];
  private toastTimer = 0;
  private npValue = '';

  onAdd: (p: Place) => void = () => {};
  onSub: (p: Place) => void = () => {};
  onSmash: (p: Place) => void = () => {};
  onAnswer: (n: number) => void = () => {};
  onChoice: (n: number) => void = () => {};
  onHome: () => void = () => {};
  onMute: () => void = () => {};
  onLevel: (m: Mode, t: Tier) => void = () => {};
  onSandbox: () => void = () => {};
  onStart: () => void = () => {};
  onCharge: () => void = () => {};

  constructor() {
    const root = $('columns');
    for (const p of [0, 1, 2, 3] as Place[]) {
      const col = document.createElement('div');
      col.className = 'col';
      col.dataset.place = String(p);
      col.innerHTML = `
        <div class="col-count">0</div>
        <div class="col-name">${PLACE_NAMES[p]}</div>
        <div class="col-btns">
          ${p > 0 ? '<button class="smash" title="Smash into ten">💥</button>' : ''}
          <button class="sub" aria-label="take one">−</button>
          <button class="add" aria-label="add one">+</button>
        </div>`;
      root.appendChild(col);
      this.cols[p] = col;
      this.counts[p] = col.querySelector('.col-count')!;
      col.querySelector('.add')!.addEventListener('click', () => this.onAdd(p));
      col.querySelector('.sub')!.addEventListener('click', () => this.onSub(p));
      col.querySelector('.smash')?.addEventListener('click', () => this.onSmash(p));
    }

    const keys = $('np-keys');
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK']) {
      const b = document.createElement('button');
      b.textContent = k;
      if (k === 'OK') b.className = 'ok';
      if (k === '⌫') b.className = 'del';
      b.addEventListener('click', () => this.key(k));
      keys.appendChild(b);
    }
    window.addEventListener('keydown', (e) => {
      if ($('numpad').hidden) return;
      if (/^[0-9]$/.test(e.key)) this.key(e.key);
      else if (e.key === 'Backspace') this.key('⌫');
      else if (e.key === 'Enter') this.key('OK');
    });

    $('ch-a').addEventListener('click', () => this.onChoice(Number($('ch-a').dataset.value)));
    $('ch-b').addEventListener('click', () => this.onChoice(Number($('ch-b').dataset.value)));
    $('btn-smash').addEventListener('click', () => this.onCharge());
    $('btn-home').addEventListener('click', () => this.onHome());
    $('btn-mute').addEventListener('click', () => this.onMute());
    $('btn-sandbox').addEventListener('click', () => this.onSandbox());
    $('splash').addEventListener('click', () => this.onStart());
    $('splash').addEventListener('touchend', (e) => { e.preventDefault(); this.onStart(); });
  }

  private key(k: string): void {
    if (k === 'OK') {
      if (!this.npValue) return;
      this.onAnswer(Number(this.npValue));
      return;
    }
    if (k === '⌫') this.npValue = this.npValue.slice(0, -1);
    else if (this.npValue.length < 5) this.npValue += k;
    $('np-display').textContent = this.npValue ? Number(this.npValue).toLocaleString('en-GB') : ' ';
  }

  // ---- screens ----

  hideSplash(): void { $('splash').hidden = true; }

  showMenu(save: SaveData): void {
    const d = $('districts');
    d.innerHTML = '';
    for (const mode of MODES) {
      const card = document.createElement('div');
      card.className = 'district';
      const info = MODE_INFO[mode];
      card.innerHTML = `<h3>${info.icon} ${info.title}</h3><p>${info.blurb}</p><div class="tiers"></div>`;
      const tiers = card.querySelector('.tiers')!;
      for (const tier of TIERS) {
        const stars = save.stars[levelKey(mode, tier)] ?? 0;
        const b = document.createElement('button');
        b.className = 'tier-btn';
        b.innerHTML = `<span>${tierLabel(mode, tier)}</span><span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
        b.addEventListener('click', () => this.onLevel(mode, tier));
        tiers.appendChild(b);
      }
      d.appendChild(card);
    }
    $('city-count').textContent = save.towers ? `City: ${save.towers} tower${save.towers === 1 ? '' : 's'} lit ✨` : 'Finish a level to light up the city.';
    $('menu').hidden = false;
    $('topbar').classList.add('menu');
    $('result').hidden = true;
    $('blueprint').hidden = true;
    $('columns').hidden = true;
    $('round-dots').hidden = true;
    $('numpad').hidden = true;
    $('choices').hidden = true;
    $('btn-smash').hidden = true;
    this.hideToast();
  }

  showPlay(): void {
    $('menu').hidden = true;
    $('topbar').classList.remove('menu');
    $('result').hidden = true;
    $('blueprint').hidden = false;
    $('columns').hidden = false;
    $('round-dots').hidden = false;
  }

  showResult(stars: number, title: string, sub: string, handlers: { home: () => void; again: () => void; next?: () => void }): void {
    $('res-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'dim'}">★</span>`).join('');
    $('res-title').textContent = title;
    $('res-sub').textContent = sub;
    const home = $('res-home'); const again = $('res-again'); const next = $('res-next');
    home.onclick = handlers.home;
    again.onclick = handlers.again;
    next.hidden = !handlers.next;
    if (handlers.next) next.onclick = handlers.next;
    $('result').hidden = false;
    $('numpad').hidden = true;
    $('choices').hidden = true;
    this.hideToast();
  }

  setMuted(m: boolean): void { $('btn-mute').textContent = m ? '🔇' : '🔊'; }

  // ---- blueprint ----

  setBlueprint(title: string, big: string, words: string): void {
    $('bp-title').textContent = title;
    $('bp-big').textContent = big;
    $('bp-words').textContent = words;
  }

  /** Chips like "1 slab · 8 rods · 5 gems" that cross out as they are used. */
  setChips(remaining: number[] | null, total?: number[]): void {
    const c = $('bp-chips');
    c.innerHTML = '';
    if (!remaining) return;
    for (let p = 3; p >= 0; p--) {
      const tot = total?.[p] ?? remaining[p];
      if (!tot) continue;
      const chip = document.createElement('span');
      chip.className = 'chip' + (remaining[p] === 0 ? ' done' : '');
      chip.style.color = getComputedStyle(this.cols[p]).color;
      chip.innerHTML = `<span class="sw" style="background: currentColor"></span>${remaining[p]} ${BLOCK_NAMES[p]}${remaining[p] === 1 ? '' : 's'}`;
      c.appendChild(chip);
    }
  }

  setRoundDots(total: number, current: number): void {
    const d = $('round-dots');
    d.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const s = document.createElement('span');
      if (i < current) s.className = 'done';
      else if (i === current) s.className = 'now';
      d.appendChild(s);
    }
  }

  // ---- columns ----

  setCounts(counts: number[]): void {
    counts.forEach((n, p) => {
      const el = this.counts[p];
      if (el.textContent !== String(n)) {
        el.textContent = String(n);
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    });
  }

  setButtons(p: Place, state: ColumnButtons): void {
    const col = this.cols[p];
    (col.querySelector('.add') as HTMLButtonElement).disabled = !state.add;
    (col.querySelector('.sub') as HTMLButtonElement).disabled = !state.sub;
    const smash = col.querySelector('.smash') as HTMLButtonElement | null;
    if (smash) smash.disabled = !state.smash;
  }

  pulseSmash(p: Place, on: boolean): void {
    this.cols[p]?.querySelector('.smash')?.classList.toggle('pulse', on);
  }

  shakeColumn(p: Place): void {
    const col = this.cols[p];
    col.classList.remove('shake');
    void col.offsetWidth;
    col.classList.add('shake');
  }

  setVisiblePlaces(n: number): void {
    this.cols.forEach((c, p) => { c.hidden = p >= n; });
  }

  positionColumns(xs: number[]): void {
    const w = window.innerWidth;
    const colW = this.cols[0].offsetWidth || 120;
    xs.forEach((x, p) => {
      const clamped = Math.min(w - colW / 2 - 4, Math.max(colW / 2 + 4, x));
      this.cols[p].style.left = `${clamped}px`;
    });
  }

  // ---- numpad & toast ----

  showNumpad(prompt: string): void {
    this.npValue = '';
    $('np-display').textContent = ' ';
    $('np-prompt').textContent = prompt;
    $('numpad').hidden = false;
    $('columns').classList.add('answering');
  }

  clearNumpad(): void {
    this.npValue = '';
    $('np-display').textContent = ' ';
  }

  showChoices(prompt: string, choices: [number, number]): void {
    $('ch-prompt').textContent = prompt;
    const a = $('ch-a'); const b = $('ch-b');
    a.textContent = choices[0].toLocaleString('en-GB'); a.dataset.value = String(choices[0]);
    b.textContent = choices[1].toLocaleString('en-GB'); b.dataset.value = String(choices[1]);
    $('choices').hidden = false;
    $('columns').classList.add('answering');
  }

  hideChoices(): void { $('choices').hidden = true; $('columns').classList.remove('answering'); }

  showSmash(on: boolean): void { $('btn-smash').hidden = !on; }

  hideNumpad(): void { $('numpad').hidden = true; $('columns').classList.remove('answering'); }

  toast(text: string, kind: 'good' | 'hint' | '' = '', ms = 2600): void {
    const t = $('toast');
    t.textContent = text;
    t.className = kind;
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
  }

  hideToast(): void {
    clearTimeout(this.toastTimer);
    $('toast').hidden = true;
  }
}
