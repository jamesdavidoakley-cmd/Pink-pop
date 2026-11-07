import type { BoardScene } from '../board3d/scene';
import { BoardView } from '../board3d/view';
import { BoardInput } from '../board3d/input';
import type { Engine } from '../chess/engine';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { HumanMover } from './mover';
import { PlaySession } from './play';
import { PuzzleSession } from './puzzle';
import { loadProgress, saveProgress, type Progress } from './progress';
import { LADDER } from '../content/ladder';

type Session = PlaySession | PuzzleSession;

/** Screen router. Owns the one board view and swaps sessions over it. */
export class App {
  readonly view: BoardView;
  readonly hud: Hud;
  readonly screens: Screens;
  readonly mover: HumanMover;
  progress: Progress;
  current: Session | null = null;

  constructor(
    scene: BoardScene,
    hudRoot: HTMLElement,
    screensRoot: HTMLElement,
    private engine: Engine,
  ) {
    this.view = new BoardView(scene);
    this.hud = new Hud(hudRoot);
    this.screens = new Screens(screensRoot);
    this.mover = new HumanMover(this.view, new BoardInput(scene), this.hud);
    this.progress = loadProgress();
    this.hud.onBack = () => this.goHome();
    this.screens.onPlay = () => this.goPlay();
    this.screens.onRung = (_r, i) => void this.goPuzzle(i);
    (window as unknown as { __app: App }).__app = this;
  }

  private swap(next: Session | null) {
    this.current?.dispose();
    this.mover.reset();
    this.current = next;
  }

  goHome() {
    this.swap(null);
    this.hud.show(false);
    this.screens.home(this.progress);
  }

  goPlay() {
    const s = new PlaySession(this.view, this.hud, this.mover, this.engine);
    this.swap(s);
    this.screens.hide();
    this.hud.show(true);
    s.start();
    return s;
  }

  async goPuzzle(rungIndex: number) {
    const rung = LADDER.rungs[rungIndex];
    if (!rung) return null;
    const s = new PuzzleSession(this.view, this.hud, this.mover, rung, this.progress, (p) => {
      this.progress = p;
      saveProgress(p);
    });
    this.swap(s);
    this.screens.hide();
    this.hud.show(true);
    await s.start();
    return s;
  }

  state() {
    return this.current?.state() ?? null;
  }
}
