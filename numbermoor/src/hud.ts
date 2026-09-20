// All the DOM. The app talks to this; this never touches the canvas.
import { HOUSES, type HouseId, type SaveData } from './save';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
export type ClassId = 'potions' | 'brooms';
export const CLASS_INFO: Record<ClassId, { title: string; icon: string; blurb: string; lesson: string; tiers: string[] }> = {
  potions: { title: 'Potion Scales', icon: '⚗️', blurb: 'Find what the mystery bottle weighs.', lesson: 'Whatever you take from one pan, take from the other.', tiers: ['one bottle', 'twin bottles', 'both pans'] },
  brooms: { title: 'Broom Formations', icon: '🧹', blurb: 'Fly every formation a number can make.', lesson: 'Rows × brooms per row. Single file only? Prime!', tiers: ['to 12', 'to 24', 'to 36'] },
};

export class Hud {
  private toastTimer = 0;
  onStart: () => void = () => {};
  onHome: () => void = () => {};
  onMute: () => void = () => {};
  onHouse: (h: HouseId) => void = () => {};
  onLevel: (c: ClassId, t: 1 | 2 | 3) => void = () => {};
  onUndo: () => void = () => {};
  onHalve: () => void = () => {};
  onChoice: (n: number) => void = () => {};
  onRows: (d: number) => void = () => {};
  onCols: (d: number) => void = () => {};
  onSwap: () => void = () => {};
  onFly: () => void = () => {};
  onSay: () => void = () => {};

  constructor() {
    $('splash').addEventListener('click', () => this.onStart());
    $('splash').addEventListener('touchend', (e) => { e.preventDefault(); this.onStart(); });
    $('btn-home').addEventListener('click', () => this.onHome());
    $('btn-mute').addEventListener('click', () => this.onMute());
    $('btn-undo').addEventListener('click', () => this.onUndo());
    $('btn-halve').addEventListener('click', () => this.onHalve());
    $('btn-say').addEventListener('click', () => this.onSay());
    $('rows-minus').addEventListener('click', () => this.onRows(-1));
    $('rows-plus').addEventListener('click', () => this.onRows(1));
    $('cols-minus').addEventListener('click', () => this.onCols(-1));
    $('cols-plus').addEventListener('click', () => this.onCols(1));
    $('btn-swap').addEventListener('click', () => this.onSwap());
    $('btn-fly').addEventListener('click', () => this.onFly());
    const hp = $('house-pick');
    for (const id of Object.keys(HOUSES) as HouseId[]) {
      const h = HOUSES[id];
      const b = document.createElement('button');
      b.className = 'house'; b.style.setProperty('--h', h.color);
      b.innerHTML = `<span class="crest">${h.crest}</span><span class="hname">${h.name}</span><span class="motto">${h.motto}</span>`;
      b.addEventListener('click', () => this.onHouse(id));
      hp.appendChild(b);
    }
  }

  hideSplash(): void { $('splash').hidden = true; }

  showHome(save: SaveData): void {
    $('home').hidden = false;
    $('topbar').classList.add('menu');
    $('result').hidden = true;
    $('play-panel').hidden = true;
    $('potion-controls').hidden = true;
    $('broom-controls').hidden = true;
    $('choices').hidden = true;
    $('found').hidden = true;
    this.hideToast();
    const picking = !save.house;
    $('house-pick').hidden = !picking;
    $('classes').hidden = picking;
    $('house-line').hidden = picking;
    $('pick-title').hidden = !picking;
    if (save.house) {
      const h = HOUSES[save.house];
      $('house-line').innerHTML = `<span class="crest" style="--h:${h.color}">${h.crest}</span> <b>${h.name}</b> · ${save.points} house point${save.points === 1 ? '' : 's'}`;
      const c = $('classes'); c.innerHTML = '';
      for (const id of ['potions', 'brooms'] as ClassId[]) {
        const info = CLASS_INFO[id];
        const card = document.createElement('div'); card.className = `district ${id}`;
        card.innerHTML = `<h3>${info.icon} ${info.title}</h3><p>${info.blurb}</p><p class="lesson">${info.lesson}</p><div class="tiers"></div>`;
        const tiers = card.querySelector('.tiers')!;
        ([1, 2, 3] as const).forEach((t) => {
          const stars = save.stars[`${id}-${t}`] ?? 0;
          const b = document.createElement('button'); b.className = 'tier-btn';
          b.innerHTML = `<span>${info.tiers[t - 1]}</span><span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
          b.addEventListener('click', () => this.onLevel(id, t));
          tiers.appendChild(b);
        });
        c.appendChild(card);
      }
    }
  }

  showPlay(cls: ClassId): void {
    $('home').hidden = true;
    $('topbar').classList.remove('menu');
    $('result').hidden = true;
    $('play-panel').hidden = false;
    $('potion-controls').hidden = cls !== 'potions';
    $('broom-controls').hidden = cls !== 'brooms';
    $('found').hidden = cls !== 'brooms';
    $('choices').hidden = true;
  }

  setMuted(m: boolean): void { $('btn-mute').textContent = m ? '🔇' : '🔊'; }
  setTitle(title: string, prompt: string, words: string): void { $('pp-title').textContent = title; $('pp-prompt').textContent = prompt; $('pp-words').textContent = words; const o = $('owl'); o.classList.remove('talk'); void o.offsetWidth; o.classList.add('talk'); }
  setRoundDots(total: number, current: number): void {
    const d = $('round-dots'); d.innerHTML = '';
    for (let i = 0; i < total; i++) { const s = document.createElement('span'); s.className = i < current ? 'done' : i === current ? 'now' : ''; d.appendChild(s); }
  }
  setPoints(points: number, house: HouseId | null): void {
    const el = $('points');
    el.textContent = house ? `${HOUSES[house].crest} ${points}` : '';
  }
  bumpPoints(): void { const el = $('points'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  // potions
  setHalve(enabled: boolean, pulse: boolean): void { const b = $('btn-halve') as HTMLButtonElement; b.disabled = !enabled; b.classList.toggle('pulse', pulse); }
  setUndo(enabled: boolean): void { ($('btn-undo') as HTMLButtonElement).disabled = !enabled; }
  showChoices(prompt: string, options: number[]): void {
    $('ch-prompt').textContent = prompt;
    const row = $('ch-row'); row.innerHTML = '';
    for (const n of options) { const b = document.createElement('button'); b.className = 'choice'; b.textContent = String(n); b.addEventListener('click', () => this.onChoice(n)); row.appendChild(b); }
    $('choices').hidden = false;
  }
  hideChoices(): void { $('choices').hidden = true; }

  // brooms
  setRowsCols(rows: number, cols: number, product: number, n: number): void {
    $('rows-val').textContent = String(rows); $('cols-val').textContent = String(cols);
    const eq = $('equation'); eq.textContent = `${rows} × ${cols} = ${product}`;
    eq.className = product === n ? 'ok' : product > n ? 'over' : '';
  }
  setFound(pairs: [number, number][], found: Set<string>, prime: boolean): void {
    const el = $('found'); el.innerHTML = '';
    for (const [r, c] of pairs) {
      const key = `${r}x${c}`; const chip = document.createElement('span');
      chip.className = 'fchip' + (found.has(key) ? ' got' : ''); chip.textContent = found.has(key) ? `${r} × ${c}` : '?';
      el.appendChild(chip);
    }
    if (prime && found.size >= pairs.length) { const p = document.createElement('span'); p.className = 'fchip prime'; p.textContent = 'PRIME'; el.appendChild(p); }
  }

  showResult(stars: number, title: string, sub: string, handlers: { home: () => void; again: () => void; next?: () => void }): void {
    $('res-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'dim'}">★</span>`).join('');
    $('res-title').textContent = title; $('res-sub').textContent = sub;
    $('res-home').onclick = handlers.home; $('res-again').onclick = handlers.again;
    const next = $('res-next'); next.hidden = !handlers.next; if (handlers.next) next.onclick = handlers.next;
    $('result').hidden = false; $('choices').hidden = true; this.hideToast();
  }

  toast(text: string, kind: 'good' | 'hint' | 'bad' | '' = '', ms = 2800): void {
    const t = $('toast'); t.textContent = text; t.className = kind; t.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
  }
  hideToast(): void { clearTimeout(this.toastTimer); $('toast').hidden = true; }
}
