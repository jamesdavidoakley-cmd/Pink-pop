// The state machine: menu → rounds → answer → result. Owns the model, drives scene + hud.
import { Tower, type TowerEvent } from './tower';
import { TowerScene } from './scene';
import { Hud } from './hud';
import { audio } from './audio';
import { toWords, withCommas, BLOCK_NAMES, PLACE_NAMES, mulberry32, plural, type Place } from './number';
import { makeLevel, MODE_INFO, tierLabel, ROUNDS_PER_LEVEL, type Mode, type Tier, type Round, MODES } from './levels';
import { loadSave, writeSave, levelKey, type SaveData } from './save';

type Phase = 'menu' | 'play' | 'answer' | 'result' | 'sandbox';

export class Game {
  private tower = new Tower();
  private save: SaveData = loadSave();
  private phase: Phase = 'menu';
  private mode: Mode = 'build';
  private tier: Tier = 1;
  private rounds: Round[] = [];
  private roundIdx = 0;
  private round!: Round;
  private remaining = [0, 0, 0, 0];
  private mistakes = 0;
  private wrongThisRound = 0;
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private rand = mulberry32(Date.now() & 0xffffffff);

  constructor(private scene: TowerScene, private hud: Hud) {
    audio.setMuted(this.save.muted);
    hud.setMuted(this.save.muted);
    scene.setLandmarks(this.save.towers);
    scene.setCounts([0, 0, 0, 0]);

    hud.onStart = () => { audio.unlock(); hud.hideSplash(); audio.tick(); this.toMenu(); };
    hud.onHome = () => this.toMenu();
    hud.onMute = () => {
      this.save.muted = !this.save.muted;
      audio.setMuted(this.save.muted);
      hud.setMuted(this.save.muted);
      writeSave(this.save);
    };
    hud.onLevel = (m, t) => this.startLevel(m, t);
    hud.onSandbox = () => this.startSandbox();
    hud.onAdd = (p) => void this.act('add', p);
    hud.onSub = (p) => void this.act('sub', p);
    hud.onSmash = (p) => void this.act('smash', p);
    hud.onAnswer = (n) => this.answer(n);

    this.toMenu();
    this.loop();
  }

  /** Read-only snapshot for headless checks. */
  debug(): { phase: Phase; counts: number[]; remaining: number[]; target: number; round: number } {
    return { phase: this.phase, counts: [...this.tower.counts], remaining: [...this.remaining], target: this.round?.target ?? -1, round: this.roundIdx };
  }

  private loop = (): void => {
    this.scene.render();
    if (this.phase !== 'menu') {
      this.hud.positionColumns([0, 1, 2, 3].map((p) => this.scene.columnScreenX(p as Place)));
    }
    requestAnimationFrame(this.loop);
  };

  // ---- navigation ----

  private toMenu(): void {
    this.phase = 'menu';
    this.hud.hideNumpad();
    this.hud.showMenu(this.save);
    this.tower.set(0);
    this.resetScene([0, 0, 0, 0]);
    audio.setMuted(this.save.muted);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Drop any queued animations and rebuild the tower instantly. */
  private resetScene(counts: number[]): void {
    this.generation++;
    this.chain = Promise.resolve();
    this.scene.setCounts(counts);
  }

  private startLevel(mode: Mode, tier: Tier): void {
    this.mode = mode;
    this.tier = tier;
    this.rounds = makeLevel(mode, tier, this.rand);
    this.setPlaces(tier === 1 ? 3 : 4);
    this.roundIdx = 0;
    this.mistakes = 0;
    this.hud.showPlay();
    audio.tick();
    this.startRound();
  }

  private setPlaces(n: number): void {
    this.scene.setVisiblePlaces(n);
    this.hud.setVisiblePlaces(n);
  }

  private startSandbox(): void {
    this.phase = 'sandbox';
    this.setPlaces(4);
    this.hud.showPlay();
    this.hud.setRoundDots(0, 0);
    this.hud.setChips(null);
    this.tower.set(0);
    this.resetScene([0, 0, 0, 0]);
    this.refreshSandbox();
    audio.speak('Free build. Add ten gems and watch them fuse into a rod.');
  }

  private refreshSandbox(): void {
    const v = this.tower.value();
    this.hud.setBlueprint('Free build', withCommas(v), v ? toWords(v) : 'Tap + to add a block');
    this.hud.setCounts(this.tower.counts);
    for (const p of [0, 1, 2, 3] as Place[]) {
      this.hud.setButtons(p, { add: this.tower.canAdd(p), sub: this.tower.canRemove(p), smash: this.tower.canSmash(p) });
    }
  }

  private startRound(): void {
    this.phase = 'play';
    this.round = this.rounds[this.roundIdx];
    this.wrongThisRound = 0;
    this.remaining = [...this.round.delta];
    this.tower.set(this.round.start);
    this.resetScene(this.tower.counts);
    this.hud.hideNumpad();
    this.hud.hideToast();
    this.hud.setRoundDots(ROUNDS_PER_LEVEL, this.roundIdx);
    const info = MODE_INFO[this.mode];
    this.hud.setBlueprint(`${info.title} · ${tierLabel(this.mode, this.tier)}`, this.round.big, this.round.words);
    if (this.mode === 'add' || this.mode === 'take' || this.mode === 'build') this.hud.setChips(this.remaining, this.round.delta);
    else this.hud.setChips(null);
    this.hud.setCounts(this.tower.counts);
    this.refreshButtons();
    audio.speak(this.round.words);
  }

  // ---- button state ----

  private refreshButtons(): void {
    for (const p of [0, 1, 2, 3] as Place[]) {
      let s = { add: false, sub: false, smash: false };
      switch (this.mode) {
        case 'build':
          s = { add: this.tower.canAdd(p), sub: this.tower.canRemove(p), smash: false };
          break;
        case 'make':
          s = { add: this.tower.canAdd(p), sub: this.tower.canRemove(p), smash: false };
          break;
        case 'add':
          s = { add: this.remaining[p] > 0 && this.tower.canAdd(p), sub: false, smash: false };
          break;
        case 'take': {
          const needsMore = p > 0 && this.remaining[p - 1] > this.tower.counts[p - 1];
          s = { add: false, sub: this.remaining[p] > 0, smash: this.tower.canSmash(p) && needsMore };
          this.hud.pulseSmash(p, s.smash && this.tower.counts[p - 1] === 0);
          break;
        }
      }
      this.hud.setButtons(p, s);
    }
  }

  private soundFor(e: TowerEvent): void {
    switch (e.type) {
      case 'add': audio.pop(e.place); break;
      case 'remove': audio.drop(); break;
      case 'fuse': audio.chime(e.place); break;
      case 'smash': audio.crackle(); break;
    }
  }

  // ---- actions ----

  private act(kind: 'add' | 'sub' | 'smash', p: Place): void {
    if (this.phase !== 'play' && this.phase !== 'sandbox') return;
    let events: TowerEvent[] = [];
    if (kind === 'add') {
      events = this.tower.add(p);
      if (events.length && this.phase === 'play' && (this.mode === 'add') && this.remaining[p] > 0) this.remaining[p]--;
    } else if (kind === 'sub') {
      if (!this.tower.canRemove(p)) {
        audio.nope();
        this.hud.shakeColumn(p);
        void this.scene.shake(p);
        if (p < 3) {
          this.hud.toast(`No ${BLOCK_NAMES[p]}s left! Smash a ${BLOCK_NAMES[p + 1]} to make ten ${BLOCK_NAMES[p]}s.`, 'hint');
          this.hud.pulseSmash((p + 1) as Place, true);
          audio.speak(`No ${BLOCK_NAMES[p]}s left. Smash a ${BLOCK_NAMES[p + 1]} to make ten ${BLOCK_NAMES[p]}s.`);
        }
        return;
      }
      events = this.tower.remove(p);
      if (events.length && this.phase === 'play' && this.mode === 'take' && this.remaining[p] > 0) this.remaining[p]--;
    } else {
      events = this.tower.smash(p);
    }
    if (!events.length) { audio.nope(); return; }

    // The model is already updated, so the HUD reacts instantly; the 3D animation queues behind any in flight.
    this.hud.setCounts(this.tower.counts);
    if (this.phase === 'sandbox') this.refreshSandbox();
    else {
      if (this.mode === 'add' || this.mode === 'take') this.hud.setChips(this.remaining, this.round.delta);
      if (this.mode === 'build') this.hud.setChips(this.buildRemaining(), this.round.delta);
      this.refreshButtons();
    }
    const fuses = events.filter((e) => e.type === 'fuse').length;
    if (fuses) {
      const e = events.find((x) => x.type === 'fuse')!;
      const msg = fuses > 1 ? 'Ten, ten, TEN! A chain fuse!' : `Ten ${BLOCK_NAMES[e.place]}s fuse into one ${BLOCK_NAMES[e.place + 1]}!`;
      this.hud.toast(msg, 'good', 2200);
    }
    if (events[0].type === 'smash') {
      const e = events[0];
      this.hud.toast(`One ${BLOCK_NAMES[e.place]} smashed into ten ${BLOCK_NAMES[e.place - 1]}s.`, 'hint', 2200);
    }
    const phaseAtTap = this.phase;
    const generation = this.generation;
    this.chain = this.chain
      .then(() => this.scene.applyEvents(events, (e) => this.soundFor(e)))
      .then(() => {
        if (this.generation !== generation) return; // the round or screen changed underneath us
        if (phaseAtTap === 'sandbox') { this.refreshSandbox(); return; }
        if (this.phase !== 'play') return;
        this.refreshButtons();
        this.checkRound();
      });
  }

  /** In build mode the chips show what is still missing against the *blueprint's* block list. */
  private buildRemaining(): number[] {
    const want = this.round.delta;
    const have = this.tower.counts;
    // Compare by value per place from the top down, so a tricky blueprint (12 rods) still reads sensibly.
    return want.map((w, p) => Math.max(0, w - have[p]));
  }

  private checkRound(): void {
    const value = this.tower.value();
    switch (this.mode) {
      case 'build':
      case 'make':
        if (value === this.round.target && this.tower.isStandard()) void this.success();
        else if (this.mode === 'make' && value > this.round.target) {
          this.hud.toast('Too tall! Take some off.', 'hint');
          audio.speak('Too tall. Take some off.');
        }
        break;
      case 'add':
      case 'take':
        if (this.remaining.every((r) => r === 0)) {
          this.phase = 'answer';
          this.hud.pulseSmash(1, false); this.hud.pulseSmash(2, false); this.hud.pulseSmash(3, false);
          for (const p of [0, 1, 2, 3] as Place[]) this.hud.setButtons(p, { add: false, sub: false, smash: false });
          const prompt = this.mode === 'add' ? 'How tall is the tower now?' : 'What is left?';
          this.hud.showNumpad(prompt);
          audio.speak(`${prompt} Read the columns: ${this.readColumns()}.`);
        }
        break;
    }
  }

  private readColumns(): string {
    const parts: string[] = [];
    for (let p = 3; p >= 0; p--) if (this.tower.counts[p]) parts.push(plural(this.tower.counts[p], PLACE_NAMES[p].slice(0, -1)));
    return parts.join(', ');
  }

  private answer(n: number): void {
    if (this.phase !== 'answer') return;
    if (n === this.round.target) {
      this.hud.hideNumpad();
      void this.success();
      return;
    }
    this.wrongThisRound++;
    this.mistakes++;
    audio.nope();
    this.hud.clearNumpad();
    const c = this.tower.counts;
    const hint = this.wrongThisRound === 1
      ? `Not quite. Read the columns left to right: ${this.readColumns()}.`
      : `The digits are ${[3, 2, 1, 0].filter((p) => c[p] || p <= Math.max(0, String(this.round.target).length - 1)).map((p) => c[p]).join(', ')}. Put them together!`;
    this.hud.toast(hint, 'hint', 4200);
    audio.speak(hint);
  }

  private async success(): Promise<void> {
    this.phase = 'result';
    this.hud.setChips(null);
    for (const p of [0, 1, 2, 3] as Place[]) { this.hud.setButtons(p, { add: false, sub: false, smash: false }); this.hud.pulseSmash(p, false); }
    const cheer = ['Brilliant!', 'Tower built!', 'You did it!', 'Perfect!', 'Superb!'][this.roundIdx % 5];
    this.hud.toast(`${cheer} ${withCommas(this.round.target)} — ${toWords(this.round.target)}.`, 'good', 3000);
    audio.fanfare();
    audio.speak(`${cheer} ${toWords(this.round.target)}.`);
    this.hud.setRoundDots(ROUNDS_PER_LEVEL, this.roundIdx + 1);
    await this.scene.celebrate();
    await new Promise((r) => setTimeout(r, 900));
    this.roundIdx++;
    if (this.roundIdx < ROUNDS_PER_LEVEL) { this.startRound(); return; }
    this.finishLevel();
  }

  private finishLevel(): void {
    const stars = this.mistakes <= 1 ? 3 : this.mistakes <= 3 ? 2 : 1;
    const key = levelKey(this.mode, this.tier);
    const prev = this.save.stars[key] ?? 0;
    if (!prev) this.save.towers++;
    this.save.stars[key] = Math.max(prev, stars);
    writeSave(this.save);
    this.scene.setLandmarks(this.save.towers);

    const nextTier = (this.tier + 1) as Tier;
    const nextMode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    const next = this.tier < 3 ? { mode: this.mode, tier: nextTier } : { mode: nextMode, tier: 1 as Tier };
    const sub = prev ? `${MODE_INFO[this.mode].title} ${tierLabel(this.mode, this.tier)} — ${stars} star${stars === 1 ? '' : 's'}.`
      : `A new tower lights up the city! That's ${this.save.towers} so far.`;
    audio.speak(prev ? 'Level complete!' : 'Level complete! A new tower lights up the city.');
    this.hud.showResult(stars, 'Level complete!', sub, {
      home: () => this.toMenu(),
      again: () => this.startLevel(this.mode, this.tier),
      next: () => this.startLevel(next.mode, next.tier),
    });
  }
}
