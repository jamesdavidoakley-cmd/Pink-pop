import type { AttackReport } from '../chess/attack-lens';

export class Hud {
  private root: HTMLElement;
  private meterFill: HTMLElement;
  private meterLabel: HTMLElement;
  private coach: HTMLElement;
  private status: HTMLElement;
  private newGameBtn: HTMLButtonElement;
  onNewGame: (() => void) | null = null;

  constructor(root: HTMLElement, botName: string) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="brand">King Hunt</div>
        <div class="meter" aria-label="Attack meter">
          <div class="meter-fill"></div>
          <div class="meter-label">Attack 0</div>
        </div>
        <div class="opponent">vs <b>${botName}</b></div>
      </div>
      <div class="hud-bottom">
        <div class="coach" role="status"></div>
        <div class="row">
          <div class="status"></div>
          <button class="btn new-game">New game</button>
        </div>
      </div>`;
    this.meterFill = root.querySelector('.meter-fill')!;
    this.meterLabel = root.querySelector('.meter-label')!;
    this.coach = root.querySelector('.coach')!;
    this.status = root.querySelector('.status')!;
    this.newGameBtn = root.querySelector('.new-game')!;
    this.newGameBtn.addEventListener('click', () => this.onNewGame?.());
  }

  setAttack(report: AttackReport) {
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
}
