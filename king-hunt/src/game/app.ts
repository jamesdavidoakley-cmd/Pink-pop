import type { BoardScene } from '../board3d/scene';
import { BoardView } from '../board3d/view';
import { BoardInput } from '../board3d/input';
import type { Engine } from '../chess/engine';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { HumanMover } from './mover';
import { PlaySession, type PlayOptions } from './play';
import { PuzzleSession } from './puzzle';
import { RecipeSession } from './recipe';
import { botById } from './bots';
import { currentRungIndex, loadProgress, saveProgress, type Progress } from './progress';
import { LADDER } from '../content/ladder';
import { RECIPES } from '../content/recipes';

type Session = PlaySession | PuzzleSession | RecipeSession;

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
    this.screens.onRecipe = (r) => void this.goRecipe(r.id);
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

  private saveP = (p: Progress) => {
    this.progress = p;
    saveProgress(p);
  };

  /** Default sparring partner: the bot of the rung Max is currently on. */
  currentBot() {
    return botById(LADDER.rungs[currentRungIndex(this.progress, LADDER)]!.bot);
  }

  goPlay(opts: PlayOptions = {}) {
    const s = new PlaySession(this.view, this.hud, this.mover, this.engine, { bot: this.currentBot(), ...opts });
    this.swap(s);
    this.screens.hide();
    this.hud.show(true);
    s.start();
    return s;
  }

  async goPuzzle(rungIndex: number) {
    const rung = LADDER.rungs[rungIndex];
    if (!rung) return null;
    const s = new PuzzleSession(this.view, this.hud, this.mover, rung, this.progress, this.saveP);
    this.swap(s);
    this.screens.hide();
    this.hud.show(true);
    await s.start();
    return s;
  }

  async goRecipe(id: string) {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return null;
    const s = new RecipeSession(this.view, this.hud, this.mover, recipe, this.progress, this.saveP);
    s.onFinished = (r, fen) => {
      // Try it live: same start, against a bot that takes bait.
      const rungBot = botById(LADDER.rungs.find((x) => x.id === r.rung)?.bot ?? 'pawnsworth');
      const bot = { ...rungBot, flaws: { ...rungBot.flaws, greedy: Math.max(rungBot.flaws.greedy ?? 0, 0.9) } };
      this.goPlay({ fen, side: r.side, bot, label: `${r.title}, live` });
    };
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
