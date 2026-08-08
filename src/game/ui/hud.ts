import type { Strings } from '../../engine/loader';
import type { Session } from '../session';
import type { Player } from '../player/player';

/** Diegetic-leaning HUD: hearts, chips, brain power, fossils, interact prompt. */
export class Hud {
  private root: HTMLDivElement;
  private hearts: HTMLDivElement;
  private chips: HTMLDivElement;
  private fossils: HTMLDivElement;
  private brain: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toastWrap: HTMLDivElement;

  constructor(uiRoot: HTMLElement, readonly strings: Strings) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.hearts = mk('hud-row hud-hearts');
    this.chips = mk('hud-row hud-chip');
    this.fossils = mk('hud-row hud-fossil');
    this.brain = mk('hud-row');
    const brainLabel = document.createElement('span');
    brainLabel.textContent = '🧠';
    const meter = document.createElement('div');
    meter.className = 'brain-meter';
    for (let i = 0; i < 5; i++) {
      const seg = document.createElement('div');
      seg.className = 'brain-seg';
      meter.appendChild(seg);
    }
    this.brain.append(brainLabel, meter);
    this.root.append(this.hearts, this.chips, this.fossils, this.brain);
    uiRoot.appendChild(this.root);

    this.prompt = document.createElement('div');
    this.prompt.className = 'hud-prompt';
    this.prompt.style.display = 'none';
    uiRoot.appendChild(this.prompt);

    this.toastWrap = document.createElement('div');
    this.toastWrap.className = 'toast-wrap';
    uiRoot.appendChild(this.toastWrap);
  }

  setVisible(v: boolean): void { this.root.style.display = v ? '' : 'none'; }

  update(session: Session, player: Player, totalFossils: number): void {
    const full = Math.ceil(player.hearts);
    const empty = player.maxHearts - full;
    this.hearts.innerHTML = `${'♥'.repeat(Math.max(0, full))}<span class="empty">${'♥'.repeat(Math.max(0, empty))}</span>`;
    this.chips.textContent = `⬡ ${session.chipsCarried}`;
    this.fossils.textContent = `★ ${session.fossilCount} / ${totalFossils}`;
    const segs = this.brain.querySelectorAll('.brain-seg');
    segs.forEach((el, i) => el.classList.toggle('full', i < player.brainSegments));
  }

  showPrompt(key: string, label: string): void {
    this.prompt.innerHTML = `<span class="key">${key}</span>${escapeHtml(label)}`;
    this.prompt.style.display = '';
  }
  hidePrompt(): void { this.prompt.style.display = 'none'; }

  toast(text: string, seconds = 3): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.toastWrap.appendChild(t);
    setTimeout(() => t.remove(), seconds * 1000);
  }

  banner(text: string, seconds = 2.6): void {
    const b = document.createElement('div');
    b.className = 'banner';
    b.textContent = text;
    this.root.parentElement?.appendChild(b);
    setTimeout(() => b.remove(), seconds * 1000);
  }
}

function mk(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
