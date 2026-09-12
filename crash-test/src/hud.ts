// All the DOM. The game talks to this; this never touches the canvas.
import { SEGMENTS, BLOCKS, TOOL_INFO, isSegment, isBlock, type ToolKind } from './parts';
import { MODES, TIERS, MODE_INFO, type ModeId, type Tier } from './levels';
import { levelKey, type SaveData } from './save';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class Hud {
  private toastTimer = 0;
  private toolButtons = new Map<ToolKind, HTMLButtonElement>();

  onHome: () => void = () => {};
  onMute: () => void = () => {};
  onLevel: (m: ModeId, t: Tier) => void = () => {};
  onStart: () => void = () => {};
  onTool: (t: ToolKind) => void = () => {};
  onUndo: () => void = () => {};
  onClear: () => void = () => {};
  onTest: () => void = () => {};

  constructor() {
    $('btn-home').addEventListener('click', () => this.onHome());
    $('btn-mute').addEventListener('click', () => this.onMute());
    $('btn-undo').addEventListener('click', () => this.onUndo());
    $('btn-clear').addEventListener('click', () => this.onClear());
    $('btn-test').addEventListener('click', () => this.onTest());
    $('splash').addEventListener('click', () => this.onStart());
    $('splash').addEventListener('touchend', (e) => { e.preventDefault(); this.onStart(); });
  }

  hideSplash(): void { $('splash').hidden = true; }

  showMenu(save: SaveData): void {
    const d = $('districts');
    d.innerHTML = '';
    for (const mode of MODES) {
      const card = document.createElement('div');
      card.className = 'district';
      const info = MODE_INFO[mode];
      card.innerHTML = `<h3>${info.icon} ${info.title}</h3><p>${info.blurb}</p><p class="lesson">${info.lesson}</p><div class="tiers"></div>`;
      const tiers = card.querySelector('.tiers')!;
      for (const tier of TIERS) {
        const stars = save.stars[levelKey(mode, tier)] ?? 0;
        const b = document.createElement('button');
        b.className = 'tier-btn';
        b.innerHTML = `<span>Level ${tier}</span><span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
        b.addEventListener('click', () => this.onLevel(mode, tier));
        tiers.appendChild(b);
      }
      d.appendChild(card);
    }
    const total = Object.values(save.stars).reduce((s, n) => s + n, 0);
    $('star-count').textContent = total ? `${total} star${total === 1 ? '' : 's'} earned` : 'Build it. Test it. Fix it.';
    $('menu').hidden = false;
    $('topbar').classList.add('menu');
    $('result').hidden = true;
    $('blueprint').hidden = true;
    $('palette').hidden = true;
    $('actions').hidden = true;
    $('testbar').hidden = true;
    this.hideToast();
  }

  showBuild(): void {
    $('menu').hidden = true;
    $('topbar').classList.remove('menu');
    $('result').hidden = true;
    $('blueprint').hidden = false;
    $('palette').hidden = false;
    $('actions').hidden = false;
    $('testbar').hidden = true;
  }

  showTesting(): void {
    $('palette').hidden = true;
    $('actions').hidden = true;
    $('testbar').hidden = false;
  }

  setMuted(m: boolean): void { $('btn-mute').textContent = m ? '🔇' : '🔊'; }

  setBlueprint(title: string, prompt: string): void {
    $('bp-title').textContent = title;
    $('bp-prompt').textContent = prompt;
  }

  setBudget(spent: number, budget: number, par: number): void {
    const el = $('bp-budget');
    if (!budget) { el.textContent = ''; return; }
    el.innerHTML = `<span class="coin">🪙</span> ${budget - spent} of ${budget} left · <span class="${spent <= par ? 'par-ok' : 'par-over'}">par ${par}</span>`;
  }

  setTools(tools: ToolKind[], selected: ToolKind): void {
    const p = $('palette');
    p.innerHTML = '';
    this.toolButtons.clear();
    for (const t of tools) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t;
      let icon = ''; let name = ''; let cost = 0; let color = '';
      if (isSegment(t)) { const d = SEGMENTS[t]; icon = d.icon; name = d.name; cost = d.cost; color = d.color; }
      else if (isBlock(t)) { const d = BLOCKS[t]; icon = d.icon; name = d.name; cost = d.cost; color = d.color; }
      else { const d = TOOL_INFO[t]; icon = d.icon; name = d.name; cost = d.cost; color = '#cfd6ff'; }
      b.style.color = color;
      b.innerHTML = `<span class="icon">${icon}</span><span class="name">${name}</span>${cost ? `<span class="cost">🪙${cost}</span>` : ''}`;
      b.addEventListener('click', () => this.onTool(t));
      p.appendChild(b);
      this.toolButtons.set(t, b);
    }
    this.selectTool(selected);
  }

  selectTool(t: ToolKind): void {
    for (const [k, b] of this.toolButtons) b.classList.toggle('selected', k === t);
    const tip = isSegment(t) ? SEGMENTS[t].tip : isBlock(t) ? BLOCKS[t].tip : TOOL_INFO[t].tip;
    $('tip').textContent = tip;
  }

  setTestBar(items: { label: string; state: 'todo' | 'now' | 'ok' | 'fail' }[]): void {
    const bar = $('testbar');
    bar.innerHTML = items.map((i) => `<span class="load ${i.state}">${i.state === 'ok' ? '✓ ' : i.state === 'fail' ? '✗ ' : ''}${i.label}</span>`).join('');
  }

  setUndo(enabled: boolean): void { ($('btn-undo') as HTMLButtonElement).disabled = !enabled; }

  showResult(stars: number, title: string, sub: string, handlers: { fix: () => void; menu: () => void; next?: () => void }): void {
    $('res-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'dim'}">★</span>`).join('');
    $('res-title').textContent = title;
    $('res-sub').textContent = sub;
    const fix = $('res-fix'); const menu = $('res-menu'); const next = $('res-next');
    fix.onclick = handlers.fix;
    menu.onclick = handlers.menu;
    next.hidden = !handlers.next;
    if (handlers.next) next.onclick = handlers.next;
    fix.textContent = stars >= 2 ? 'Build again' : 'Fix it';
    $('result').hidden = false;
    this.hideToast();
  }

  hideResult(): void { $('result').hidden = true; }

  toast(text: string, kind: 'good' | 'hint' | 'bad' | '' = '', ms = 2800): void {
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
