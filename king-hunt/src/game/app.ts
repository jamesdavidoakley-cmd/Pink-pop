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
import { ReplaySession } from './replay';
import { Daily } from './daily';
import { REPLAYS } from '../content/replays';
import { botById } from './bots';
import { currentRungIndex, loadProgress, saveProgress, setCinema, setQuality, setQuestions, setSound, setVoice, type Progress } from './progress';
import { voice } from '../audio/voice';
import { CinemaOverlay } from '../cinema/overlay';
import { Moments } from './moments';
import { sfx } from '../audio/sfx';
import { LADDER } from '../content/ladder';
import { RECIPES } from '../content/recipes';

type Session = PlaySession | PuzzleSession | RecipeSession | ReplaySession;

/** Screen router. Owns the one board view and swaps sessions over it. */
export class App {
  readonly view: BoardView;
  readonly hud: Hud;
  readonly screens: Screens;
  readonly mover: HumanMover;
  readonly overlay: CinemaOverlay;
  readonly moments: Moments;
  progress: Progress;
  current: Session | null = null;
  readonly daily = new Daily(this);

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
    this.overlay = new CinemaOverlay(hudRoot.parentElement ?? document.body);
    this.moments = new Moments(scene, this.view, this.overlay);
    this.progress = loadProgress();
    sfx.enabled = this.progress.settings.sound;
    this.moments.level = this.progress.settings.cinema ?? 'full';
    voice.enabled = this.progress.settings.voice ?? true;
    // Audio can only start after a gesture: unlock on the first pointer down anywhere.
    window.addEventListener('pointerdown', () => sfx.unlock(), { once: false, passive: true });
    this.hud.onBack = () => this.goHome();
    // Cards sit at the bottom; lift the board so the squares stay visible above them.
    this.hud.onCard = (h) => scene.setLift(h);
    this.screens.onPlay = () => this.goPlay();
    this.screens.onRung = (_r, i) => void this.goPuzzle(i);
    this.screens.onRecipe = (r) => void this.goRecipe(r.id);
    this.screens.onReplay = (r) => void this.goReplay(r.id);
    this.screens.onDaily = () => void this.daily.run();
    this.screens.onQuestions = (mode) => {
      this.saveP(setQuestions(this.progress, mode));
      this.goHome();
    };
    this.screens.onCinema = (level) => {
      this.saveP(setCinema(this.progress, level));
      this.moments.level = level;
      this.goHome();
    };
    this.screens.onVoice = (on) => {
      this.saveP(setVoice(this.progress, on));
      voice.enabled = on;
      if (!on) voice.stop();
      this.goHome();
    };
    this.screens.onQuality = (q) => {
      this.saveP(setQuality(this.progress, q));
      // The renderer is built once; the new preset applies on the next load.
      location.reload();
    };
    this.screens.onSound = (on) => {
      this.saveP(setSound(this.progress, on));
      sfx.enabled = on;
      sfx.ambience(on);
      this.goHome();
    };
    (window as unknown as { __app: App }).__app = this;
  }

  private swap(next: Session | null) {
    voice.stop();
    this.current?.dispose();
    this.mover.reset();
    this.view.timeScale = 1;
    this.view.fx.storm(0, null);
    this.overlay.letterbox(false);
    this.overlay.hideTitle();
    this.current = next;
  }

  goHome() {
    this.swap(null);
    this.hud.show(false);
    this.screens.home(this.progress, { dailyDone: this.daily.isDone(), dailyStarted: (this.progress.today?.steps.length ?? 0) > 0 && this.progress.today?.date === new Date().toISOString().slice(0, 10) });
  }

  private saveP = (p: Progress) => {
    this.progress = p;
    saveProgress(p);
  };
  setProgress(p: Progress) {
    this.saveP(p);
  }

  /** Board visible, no session, HUD shown (for cards between steps). */
  showHudOnly() {
    this.swap(null);
    this.screens.hide();
    this.hud.show(true);
    this.hud.setActions([]);
    this.hud.say([]);
  }

  /** Default sparring partner: the bot of the rung Max is currently on. */
  currentBot() {
    return botById(LADDER.rungs[currentRungIndex(this.progress, LADDER)]!.bot);
  }

  goPlay(opts: PlayOptions = {}) {
    const s = new PlaySession(this.view, this.hud, this.mover, this.engine, { bot: this.currentBot(), ...opts }, this.moments);
    this.swap(s);
    this.screens.hide();
    this.hud.show(true);
    s.start();
    return s;
  }

  async goPuzzle(rungIndex: number, opts: { targetSolves?: number; skipIntro?: boolean } = {}) {
    const rung = LADDER.rungs[rungIndex];
    if (!rung) return null;
    const s = new PuzzleSession(this.view, this.hud, this.mover, rung, this.progress, this.saveP, this.moments);
    if (opts.targetSolves) s.targetSolves = opts.targetSolves;
    if (opts.skipIntro) s.skipIntro = true;
    this.swap(s);
    this.screens.hide();
    this.hud.show(true);
    await s.start();
    return s;
  }

  async goRecipe(id: string) {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return null;
    const s = new RecipeSession(this.view, this.hud, this.mover, recipe, this.progress, this.saveP, this.moments);
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

  async goReplay(id: string) {
    const replay = REPLAYS.find((r) => r.id === id);
    if (!replay) return null;
    const s = new ReplaySession(this.view, this.hud, this.mover, replay, this.progress, this.saveP, this.moments);
    s.onFinished = () => this.goHome();
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
