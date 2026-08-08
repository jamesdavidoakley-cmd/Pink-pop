import type { Content, Strings } from '../../engine/loader';
import type { SaveData, Settings } from '../../engine/save';
import type { Session } from '../session';
import type { LevelDef } from '../../engine/types';

/**
 * DOM menu system: title, save slots, settings (accessibility v1), pause,
 * fossil select, loading screens. Arrow-key + mouse navigable; every screen
 * can be read aloud ("read menus aloud" setting) via the speakUi callback.
 */

const FOSSIL_ICONS: Record<string, string> = {
  task: '🧪', secret: '🐾', platforming: '🏃', arena: '🛡️', boss: '👑', bonus: '⬡',
};

export class MenuHost {
  private overlay: HTMLDivElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  speakUi: (text: string) => void = () => { /* game wires this */ };

  constructor(
    private uiRoot: HTMLElement,
    readonly content: Content,
    private strings: Strings,
  ) {}

  get open(): boolean { return this.overlay !== null; }

  close(): void {
    if (this.keyHandler) { document.removeEventListener('keydown', this.keyHandler); this.keyHandler = null; }
    this.overlay?.remove();
    this.overlay = null;
  }

  private screen(cls = ''): HTMLDivElement {
    this.close();
    const el = document.createElement('div');
    el.className = `menu-screen ${cls}`;
    this.uiRoot.appendChild(el);
    this.overlay = el;
    this.keyHandler = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), select, input')];
        if (!items.length) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        items[next].focus();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', this.keyHandler);
    return el;
  }

  private btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `menu-btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', () => onClick());
    b.addEventListener('focus', () => this.speakUi(label));
    return b;
  }

  // ---------------- title + slots ----------------
  showTitle(opts: { onPlay: (slot: number, fresh: boolean) => void; onSettings: () => void }): void {
    const s = this.strings;
    const el = this.screen();
    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = s.get('game.title');
    const sub = document.createElement('div');
    sub.className = 'menu-sub';
    sub.textContent = s.get('game.subtitle');
    const list = document.createElement('div');
    list.className = 'menu-list';
    void import('../../engine/save').then(({ saves }) => {
      const slotData: (SaveData | null)[] = saves.listSlots();
      slotData.forEach((slot, i) => {
        const label = slot
          ? `${s.get('menu.slot', { n: i + 1 })} — ${s.get('menu.slotSummary', { fossils: slot.fossils.length, playtime: fmtTime(slot.playtimeSeconds) })}`
          : `${s.get('menu.slot', { n: i + 1 })} — ${s.get('menu.emptySlot')}`;
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        const main = this.btn(label, () => opts.onPlay(i, !slot));
        main.style.flex = '1';
        row.appendChild(main);
        if (slot) {
          row.appendChild(this.btn('✕', () => {
            void this.confirm(s.get('menu.deleteConfirm')).then((yes) => {
              if (yes) { saves.delete(i); this.showTitle(opts); }
            });
          }, 'small danger'));
        }
        list.appendChild(row);
      });
      list.appendChild(this.btn(s.get('menu.settings'), () => opts.onSettings()));
      const first = list.querySelector('button');
      first?.focus();
    });
    el.append(title, sub, list);
  }

  // ---------------- settings ----------------
  showSettings(settings: Settings, session: Session | null, onChange: (s: Settings) => void, onClose: () => void): void {
    const s = this.strings;
    const el = this.screen();
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    panel.innerHTML = `<h2>${esc(s.get('settings.title'))}</h2>`;

    const row = (label: string, control: HTMLElement): void => {
      const r = document.createElement('div');
      r.className = 'setting-row';
      const l = document.createElement('span');
      l.textContent = label;
      r.append(l, control);
      panel.appendChild(r);
    };
    const slider = (value: number, min: number, max: number, step: number, set: (v: number) => void): HTMLInputElement => {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value);
      i.addEventListener('input', () => { set(Number(i.value)); onChange(settings); });
      return i;
    };
    const toggle = (value: boolean, set: (v: boolean) => void): HTMLButtonElement => {
      const b = this.btn(value ? '✔ ' + s.get('menu.yes') : '✕ ' + s.get('menu.no'), () => {
        value = !value;
        set(value);
        b.textContent = value ? '✔ ' + s.get('menu.yes') : '✕ ' + s.get('menu.no');
        onChange(settings);
      }, 'small toggle');
      return b;
    };
    const select = (options: [string, string][], value: string, set: (v: string) => void): HTMLSelectElement => {
      const sel = document.createElement('select');
      for (const [v, label] of options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        sel.appendChild(o);
      }
      sel.value = value;
      sel.addEventListener('change', () => { set(sel.value); onChange(settings); });
      return sel;
    };

    const h = (key: string): void => {
      const hd = document.createElement('h2');
      hd.textContent = s.get(key);
      hd.style.fontSize = '20px';
      hd.style.marginTop = '14px';
      panel.appendChild(hd);
    };

    h('settings.audio');
    row(s.get('settings.music'), slider(settings.musicVolume, 0, 1, 0.05, (v) => { settings.musicVolume = v; }));
    row(s.get('settings.sfx'), slider(settings.sfxVolume, 0, 1, 0.05, (v) => { settings.sfxVolume = v; }));
    row(s.get('settings.voiceOn'), toggle(settings.voiceOn, (v) => { settings.voiceOn = v; }));
    row(s.get('settings.speechRate'), slider(settings.speechRate, 0.7, 1.4, 0.05, (v) => { settings.speechRate = v; }));
    row(s.get('settings.readMenus'), toggle(settings.readMenus, (v) => { settings.readMenus = v; }));

    h('settings.access');
    row(s.get('settings.subtitleSize'), select([
      ['small', s.get('settings.subtitleSmall')], ['medium', s.get('settings.subtitleMedium')], ['large', s.get('settings.subtitleLarge')],
    ], settings.subtitleSize, (v) => { settings.subtitleSize = v as Settings['subtitleSize']; }));
    row(s.get('settings.dyslexiaFont'), toggle(settings.dyslexiaFont, (v) => { settings.dyslexiaFont = v; }));
    row(s.get('settings.colorSafe'), toggle(settings.colorSafe, (v) => { settings.colorSafe = v; }));
    row(s.get('settings.reduceShake'), toggle(settings.reduceShake, (v) => { settings.reduceShake = v; }));
    row(s.get('settings.reduceFlash'), toggle(settings.reduceFlash, (v) => { settings.reduceFlash = v; }));
    row(s.get('settings.holdToggle'), toggle(settings.holdToggle, (v) => { settings.holdToggle = v; }));

    h('settings.camera');
    row(s.get('settings.invertY'), toggle(settings.invertY, (v) => { settings.invertY = v; }));
    row(s.get('settings.sensitivity'), slider(settings.sensitivity, 0.4, 2, 0.1, (v) => { settings.sensitivity = v; }));

    if (session) {
      h('settings.difficulty');
      row(`${s.get('settings.explorer')} / ${s.get('settings.hero')}`, select([
        ['explorer', `${s.get('settings.explorer')} — ${s.get('settings.explorerDesc')}`],
        ['hero', `${s.get('settings.hero')} — ${s.get('settings.heroDesc')}`],
      ], session.data.difficulty, (v) => { session.data.difficulty = v as 'explorer' | 'hero'; session.save(); }));
    }

    h('settings.quality');
    row(s.get('settings.quality'), select([
      ['auto', 'Auto'], ['low', s.get('settings.qualityLow')], ['medium', s.get('settings.qualityMed')], ['high', s.get('settings.qualityHigh')],
    ], settings.quality, (v) => { settings.quality = v as Settings['quality']; }));

    if (session) {
      panel.appendChild(this.btn(s.get('settings.export'), () => {
        const blob = new Blob([JSON.stringify(session.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `star-fossils-slot${session.slot + 1}.json`;
        a.click();
      }, 'small'));
      panel.appendChild(this.btn(s.get('settings.import'), () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const { saves } = await import('../../engine/save');
            session.data = saves.import(await file.text());
            session.save();
            location.reload();
          } catch {
            alert('That file is not a Star Fossils save.');
          }
        };
        input.click();
      }, 'small'));
    }

    panel.appendChild(this.btn(s.get('menu.back'), onClose));
    el.appendChild(panel);
    panel.querySelector('button')?.focus();
  }

  // ---------------- pause ----------------
  showPause(opts: {
    onResume: () => void; onSettings: () => void; onAskDigger: () => void;
    onQuit: () => void; onGrownUps: () => void; onMap: () => void;
  }): void {
    const s = this.strings;
    const el = this.screen();
    const title = document.createElement('div');
    title.className = 'menu-title';
    title.style.fontSize = '44px';
    title.textContent = s.get('menu.paused');
    const list = document.createElement('div');
    list.className = 'menu-list';
    list.append(
      this.btn(s.get('menu.resume'), opts.onResume),
      this.btn(s.get('menu.map'), opts.onMap),
      this.btn(s.get('menu.askDigger'), opts.onAskDigger),
      this.btn(s.get('menu.settings'), opts.onSettings),
      this.grownUpsGate(opts.onGrownUps),
      this.btn(s.get('menu.quitToTitle'), opts.onQuit, 'danger'),
    );
    el.append(title, list);
    list.querySelector('button')?.focus();
  }

  /** Hold-3-seconds gate (§9.4) — stops young hands wandering in. */
  private grownUpsGate(onOpen: () => void): HTMLElement {
    const s = this.strings;
    const wrap = document.createElement('div');
    wrap.className = 'hold-gate';
    const b = this.btn(s.get('menu.grownups'), () => { /* hold, not click */ });
    const bar = document.createElement('div');
    bar.className = 'hold-bar';
    const fill = document.createElement('div');
    bar.appendChild(fill);
    bar.style.display = 'none';
    let holdT: number | null = null;
    let progress = 0;
    const start = (): void => {
      bar.style.display = '';
      holdT = window.setInterval(() => {
        progress += 0.05;
        fill.style.width = `${Math.min(100, (progress / 3) * 100)}%`;
        if (progress >= 3) { stop(); onOpen(); }
      }, 50);
    };
    const stop = (): void => {
      if (holdT) clearInterval(holdT);
      holdT = null; progress = 0; fill.style.width = '0%';
      bar.style.display = 'none';
    };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointerleave', stop);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !holdT) start(); });
    b.addEventListener('keyup', stop);
    b.title = s.get('menu.grownupsHold');
    wrap.append(b, bar);
    return wrap;
  }

  // ---------------- fossil select ----------------
  showFossilSelect(level: LevelDef, session: Session, opts: {
    onEnter: (focusFossilId: string | null) => void;
    onCancel: () => void;
    speakHint: (speaker: string, hint: string) => void;
  }): void {
    const s = this.strings;
    const el = this.screen();
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    panel.innerHTML = `<h2>${esc(s.get('fossil.select.title', { world: s.get(level.nameKey) }))}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'fossil-grid';
    for (const f of level.fossils ?? []) {
      const row = document.createElement('button');
      row.className = 'fossil-row';
      const done = session.hasFossil(f.id);
      row.innerHTML = `<span class="icon">${FOSSIL_ICONS[f.type] ?? '★'}</span>`
        + `<span style="flex:1"><div>${esc(s.get(f.nameKey))}${done ? ' <span class="done">✔</span>' : ''}</div>`
        + `<div class="hint">${esc(f.hint ?? '')}</div></span>`;
      row.addEventListener('click', () => {
        if (f.hint && f.speaker) opts.speakHint(f.speaker, f.hint);
        opts.onEnter(f.id);
      });
      row.addEventListener('focus', () => this.speakUi(s.get(f.nameKey)));
      grid.appendChild(row);
    }
    panel.appendChild(grid);
    panel.appendChild(this.btn(s.get('fossil.select.free'), () => opts.onEnter(null)));
    panel.appendChild(this.btn(s.get('menu.back'), opts.onCancel, 'small'));
    el.appendChild(panel);
    (grid.querySelector('button') as HTMLElement | null)?.focus();
  }

  // ---------------- loading ----------------
  showLoading(titleText: string, fact: string | null): () => void {
    const el = this.screen('loading-screen');
    el.classList.add('loading-screen');
    const t = document.createElement('div');
    t.className = 'loading-title';
    t.textContent = titleText;
    el.appendChild(t);
    if (fact) {
      const f = document.createElement('div');
      f.className = 'loading-fact';
      f.innerHTML = `<b>${esc(this.strings.get('loading.tip'))}</b><br>${esc(fact)}`;
      el.appendChild(f);
    }
    const shownAt = performance.now();
    return () => {
      const wait = Math.max(0, 1400 - (performance.now() - shownAt));
      setTimeout(() => { if (this.overlay === el) this.close(); }, wait);
    };
  }

  // ---------------- confirm ----------------
  confirm(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      const el = this.screen();
      const panel = document.createElement('div');
      panel.className = 'menu-panel';
      const p = document.createElement('div');
      p.style.fontSize = '20px';
      p.style.marginBottom = '16px';
      p.textContent = text;
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '12px';
      row.append(
        this.btn(this.strings.get('menu.yes'), () => { this.close(); resolve(true); }),
        this.btn(this.strings.get('menu.no'), () => { this.close(); resolve(false); }),
      );
      panel.append(p, row);
      el.appendChild(panel);
      (row.children[1] as HTMLElement).focus();
    });
  }

  /** Generic panel host for custom screens (Grown-Ups' Corner, map, tasks). */
  showPanel(build: (panel: HTMLDivElement, host: MenuHost) => void): void {
    const el = this.screen();
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    build(panel, this);
    el.appendChild(panel);
    panel.querySelector('button')?.focus();
  }

  makeButton(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    return this.btn(label, onClick, cls);
  }
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
