/** Top-of-screen question/instruction display. Spoken aloud elsewhere (§5.1.6). */
export class QuestionPanel {
  private el: HTMLDivElement;
  private textEl: HTMLDivElement;
  private subEl: HTMLDivElement;

  constructor(uiRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;top:9%;left:50%;transform:translateX(-50%);'
      + 'max-width:min(760px,90vw);background:var(--panel-bg);border:3px solid var(--panel-border);'
      + 'border-radius:16px;padding:14px 26px;text-align:center;display:none;box-shadow:0 6px 22px rgba(0,0,0,.4)';
    this.textEl = document.createElement('div');
    this.textEl.style.cssText = 'font-size:26px;font-weight:800;line-height:1.35';
    this.subEl = document.createElement('div');
    this.subEl.style.cssText = 'font-size:16px;font-weight:600;opacity:.8;margin-top:4px';
    this.el.append(this.textEl, this.subEl);
    uiRoot.appendChild(this.el);
  }

  show(text: string, sub = ''): void {
    this.textEl.textContent = text;
    this.subEl.textContent = sub;
    this.subEl.style.display = sub ? '' : 'none';
    this.el.style.display = '';
  }

  flash(good: boolean): void {
    this.el.style.borderColor = good ? 'var(--good)' : 'var(--bad)';
    setTimeout(() => { this.el.style.borderColor = 'var(--panel-border)'; }, 700);
  }

  hide(): void { this.el.style.display = 'none'; }
}
