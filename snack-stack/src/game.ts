// The state machine: menu → rounds → answer → result. Owns the model, drives scene + hud.
import { Tower, type TowerEvent } from './tower';
import { TowerScene } from './scene';
import { Hud } from './hud';
import { audio } from './audio';
import { toWords, withCommas, digitsOf, BLOCK_NAMES, PLACE_NAMES, mulberry32, plural, type Place } from './number';
import { makeLevel, MODE_INFO, tierLabel, ROUNDS_PER_LEVEL, type Mode, type Tier, type Round, MODES } from './levels';
import { loadSave, writeSave, levelKey, type SaveData } from './save';

type Phase = 'menu' | 'play' | 'answer' | 'result' | 'finale' | 'sandbox';

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
  /** Build mode: blocks the child has placed per column, so the blueprint chips survive a fuse. */
  private added = [0, 0, 0, 0];
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
    hud.onChoice = (n) => void this.choose(n);
    hud.onCharge = () => void this.smashFinale();
    hud.onBang = () => void this.bang();

    this.toMenu();
    this.loop();
  }

  /** Headless checks only: start a Build It round with a fixed blueprint, e.g. [3, 12, 4, 0]. */
  debugBuild(delta: number[]): void {
    this.mode = 'build';
    this.tier = 3;
    this.setPlaces(4);
    const target = delta.reduce((sum, c, i) => sum + c * [1, 10, 100, 1000][i], 0);
    this.rounds = Array.from({ length: ROUNDS_PER_LEVEL }, () => ({ mode: 'build' as const, start: 0, target, delta: [...delta], big: 'debug', words: 'debug' }));
    this.roundIdx = 0;
    this.mistakes = 0;
    this.hud.showPlay();
    this.startRound();
  }

  /** Read-only snapshot for headless checks. */
  debug(): { phase: Phase; mode: Mode; counts: number[]; remaining: number[]; delta: number[]; target: number; start: number; round: number; choices?: number[] } {
    return { phase: this.phase, mode: this.mode, counts: [...this.tower.counts], remaining: [...this.remaining], delta: [...(this.round?.delta ?? [])], target: this.round?.target ?? -1, start: this.round?.start ?? -1, round: this.roundIdx, choices: this.round?.choices };
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
    this.hud.hideChoices();
    this.scene.setHalfwayLine(null);
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
    audio.speak('Free bake. Stack ten cookies and watch them snap into a pack.');
  }

  private refreshSandbox(): void {
    const v = this.tower.value();
    this.hud.setBlueprint('Free bake', withCommas(v), v ? `${toWords(v)} cookies` : 'Tap + to bake a cookie');
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
    this.added = [0, 0, 0, 0];
    this.tower.set(this.round.start);
    this.resetScene(this.tower.counts);
    this.hud.hideNumpad();
    this.hud.hideChoices();
    this.hud.hideToast();
    this.hud.setRoundDots(ROUNDS_PER_LEVEL, this.roundIdx);
    this.scene.setHalfwayLine(this.mode === 'round' ? this.roundPlace() : null);
    const info = MODE_INFO[this.mode];
    this.hud.setBlueprint(`${info.title} · ${tierLabel(this.mode, this.tier)}`, this.round.big, this.round.words);
    if (this.mode === 'add' || this.mode === 'take' || this.mode === 'build') this.hud.setChips(this.remaining, this.round.delta);
    else this.hud.setChips(null);
    this.hud.setCounts(this.tower.counts);
    this.refreshButtons();
    this.hud.showBang(this.mode === 'build' || this.mode === 'make');
    audio.speak(this.round.words);
    if (this.mode === 'round' && this.round.choices) {
      this.phase = 'answer';
      this.hud.showChoices('Which is nearer?', this.round.choices);
    }
  }

  /** The column whose halfway line decides the rounding: ones for nearest 10, tens for nearest 100… */
  private roundPlace(): Place {
    return (Math.log10(this.round.roundTo ?? 10) - 1) as Place;
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
        case 'round':
          s = { add: false, sub: false, smash: false };
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
      if (events.length && this.phase === 'play' && this.mode === 'build') this.added[p]++;
    } else if (kind === 'sub') {
      if (!this.tower.canRemove(p)) {
        audio.nope();
        this.hud.shakeColumn(p);
        void this.scene.shake(p);
        if (p < 3) {
          this.hud.toast(`No ${BLOCK_NAMES[p]}${p === 2 ? 'es' : 's'} left! Open a ${BLOCK_NAMES[p + 1]} to get ten ${BLOCK_NAMES[p]}${p === 2 ? 'es' : 's'}.`, 'hint');
          this.hud.pulseSmash((p + 1) as Place, true);
          audio.speak(`No ${BLOCK_NAMES[p]}${p === 2 ? 'es' : 's'} left. Open a ${BLOCK_NAMES[p + 1]} to get ten ${BLOCK_NAMES[p]}${p === 2 ? 'es' : 's'}.`);
        }
        return;
      }
      events = this.tower.remove(p);
      if (events.length && this.phase === 'play' && this.mode === 'take' && this.remaining[p] > 0) this.remaining[p]--;
      if (events.length && this.phase === 'play' && this.mode === 'build' && this.added[p] > 0) this.added[p]--;
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
      const msg = fuses > 1 ? 'Ten, ten, TEN! A chain snap!' : `Ten ${BLOCK_NAMES[e.place]}${e.place === 2 ? 'es' : 's'} snap into one ${BLOCK_NAMES[e.place + 1]}!`;
      this.hud.toast(msg, 'good', 2200);
    }
    if (events[0].type === 'smash') {
      const e = events[0];
      this.hud.toast(`One ${BLOCK_NAMES[e.place]} opened into ten ${BLOCK_NAMES[e.place - 1]}${e.place === 3 ? 'es' : 's'}.`, 'hint', 2200);
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

  /** In build mode the chips count what the child has placed, not what is standing — a fuse must not reset them. */
  private buildRemaining(): number[] {
    return this.round.delta.map((w, p) => Math.max(0, w - this.added[p]));
  }

  private checkRound(): void {
    switch (this.mode) {
      case 'build':
      case 'make':
        // Nothing automatic: the child presses BANG when they think it's right.
        break;
      case 'add':
      case 'take':
        if (this.remaining.every((r) => r === 0)) {
          this.phase = 'answer';
          this.hud.pulseSmash(1, false); this.hud.pulseSmash(2, false); this.hud.pulseSmash(3, false);
          for (const p of [0, 1, 2, 3] as Place[]) this.hud.setButtons(p, { add: false, sub: false, smash: false });
          const prompt = this.mode === 'add' ? 'How many cookies now?' : 'How many are left?';
          this.hud.showNumpad(prompt);
          audio.speak(`${prompt} Read the plates: ${this.readColumns()}.`);
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
      ? `Not quite. Read the plates left to right: ${this.readColumns()}.`
      : `The digits are ${[3, 2, 1, 0].filter((p) => c[p] || p <= Math.max(0, String(this.round.target).length - 1)).map((p) => c[p]).join(', ')}. Put them together!`;
    this.hud.toast(hint, 'hint', 4200);
    audio.speak(hint);
  }

  /** The child says "I'm done". Right → it goes bang. Wrong → a fizzle and a nudge towards the column that's off. */
  private async bang(): Promise<void> {
    if (this.phase !== 'play' || (this.mode !== 'build' && this.mode !== 'make')) return;
    await this.chain; // let any fuse in flight land first
    if (this.phase !== 'play') return;
    const value = this.tower.value();
    if (value === this.round.target && this.tower.isStandard()) {
      this.hud.showBang(false);
      void this.success();
      return;
    }
    this.wrongThisRound++;
    this.mistakes++;
    audio.fizzle();
    this.hud.fizzleBang();
    void this.scene.fizzle();
    const want = digitsOf(this.round.target);
    let off: Place = 0;
    for (let p = 3; p >= 0; p--) if (this.tower.counts[p] !== want[p]) { off = p as Place; break; }
    const tooTall = value > this.round.target;
    const hint = this.wrongThisRound === 1
      ? `Not yet — ${tooTall ? 'too many' : 'not enough'}. Look at the ${PLACE_NAMES[off]} plate.`
      : `The ${PLACE_NAMES[off]} plate needs ${want[off]}, and it has ${this.tower.counts[off]}.`;
    this.hud.toast(hint, 'hint', 4000);
    this.hud.shakeColumn(off);
    audio.speak(hint.replace('—', ','));
  }

  private async choose(n: number): Promise<void> {
    if (this.phase !== 'answer' || this.mode !== 'round' || !this.round.choices) return;
    const place = this.roundPlace();
    const count = this.tower.counts[place];
    const up = count >= 5;
    if (n !== this.round.target) {
      this.wrongThisRound++;
      this.mistakes++;
      audio.nope();
      const hint = `Look at the ${PLACE_NAMES[place]} plate. ${count} is ${up ? 'five or more' : 'less than five'}, so it rounds ${up ? 'UP' : 'DOWN'}.`;
      this.hud.toast(hint, 'hint', 4200);
      audio.speak(hint);
      return;
    }
    // Show why: the smaller columns melt away; the deciding column either finishes its ten or vanishes.
    this.phase = 'result';
    this.hud.hideChoices();
    const events: TowerEvent[] = [];
    for (let p = 0; p < place; p++) while (this.tower.canRemove(p as Place)) events.push(...this.tower.remove(p as Place));
    if (up) while (this.tower.counts[place] > 0) events.push(...this.tower.add(place));
    else while (this.tower.canRemove(place)) events.push(...this.tower.remove(place));
    this.hud.toast(up ? `${count} reaches the halfway line — round UP to ${withCommas(this.round.target)}.` : `${count} is under the halfway line — round DOWN to ${withCommas(this.round.target)}.`, 'good', 3200);
    audio.speak(up ? 'Round up!' : 'Round down!');
    this.hud.setCounts(this.tower.counts);
    await this.scene.applyEvents(events, (e) => this.soundFor(e));
    this.scene.setHalfwayLine(null);
    await this.success();
  }

  private async success(): Promise<void> {
    this.phase = 'result';
    this.hud.setChips(null);
    this.hud.showBang(false);
    for (const p of [0, 1, 2, 3] as Place[]) { this.hud.setButtons(p, { add: false, sub: false, smash: false }); this.hud.pulseSmash(p, false); }
    const cheer = ['Yummy!', 'Order done!', 'You did it!', 'Perfect!', 'Delicious!'][this.roundIdx % 5];
    this.hud.toast(`${cheer} ${withCommas(this.round.target)} — ${toWords(this.round.target)}.`, 'good', 3000);
    audio.fanfare();
    audio.speak(`${cheer} ${toWords(this.round.target)}.`);
    this.hud.setRoundDots(ROUNDS_PER_LEVEL, this.roundIdx + 1);
    await this.scene.celebrate();
    await new Promise((r) => setTimeout(r, 900));
    this.roundIdx++;
    if (this.roundIdx < ROUNDS_PER_LEVEL) { this.startRound(); return; }
    this.offerSmash();
  }

  private levelStars(): 1 | 2 | 3 {
    return this.mistakes <= 1 ? 3 : this.mistakes <= 3 ? 2 : 1;
  }

  /** All five rounds done: the Giant Jelly rises and the child gets the SMASH button. */
  private offerSmash(): void {
    this.phase = 'finale';
    this.hud.setBlueprint('Level done!', 'The Giant Jelly', 'Tap SMASH to charge it with your cookie tower!');
    this.hud.setChips(null);
    this.hud.showSmash(true);
    audio.rumble();
    audio.speak('Level done! Here comes the giant jelly. Tap smash to charge it with your cookie tower!');
  }

  private async smashFinale(): Promise<void> {
    if (this.phase !== 'finale') return;
    this.hud.showSmash(false);
    const stars = this.levelStars();
    this.phase = 'result';
    audio.whoosh();
    audio.speak('Charge!');
    await this.scene.finale(stars, () => {
      if (stars === 1) audio.bonk(); else audio.impact(stars);
      const line = stars === 3 ? 'SPLAT! Right through the jelly!' : stars === 2 ? 'WOBBLE! You split the jelly!' : 'BOING! The jelly bounced you back.';
      this.hud.toast(line, stars === 1 ? 'hint' : 'good', 3000);
      audio.speak(line);
    });
    this.finishLevel();
  }

  private finishLevel(): void {
    const stars = this.levelStars();
    const key = levelKey(this.mode, this.tier);
    const prev = this.save.stars[key] ?? 0;
    if (!prev) this.save.towers++;
    this.save.stars[key] = Math.max(prev, stars);
    writeSave(this.save);
    this.scene.setLandmarks(this.save.towers);

    const nextTier = (this.tier + 1) as Tier;
    const nextMode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    const next = this.tier < 3 ? { mode: this.mode, tier: nextTier } : { mode: nextMode, tier: 1 as Tier };
    const wallLine = stars === 3 ? 'Splat, straight through the Giant Jelly!' : stars === 2 ? 'You split the Giant Jelly.' : 'The Giant Jelly bounced you off. Fewer slips and it splats!';
    const sub = prev ? `${wallLine} ${MODE_INFO[this.mode].title} ${tierLabel(this.mode, this.tier)} — ${stars} star${stars === 1 ? '' : 's'}.`
      : `${wallLine} A new cake goes on the shelf — that's ${this.save.towers} so far.`;
    audio.speak(prev ? 'Level complete!' : 'Level complete! A new cake goes on the shelf.');
    this.hud.showResult(stars, stars === 3 ? 'Splat!' : stars === 2 ? 'Split it!' : 'Level complete', sub, {
      home: () => this.toMenu(),
      again: () => this.startLevel(this.mode, this.tier),
      next: () => this.startLevel(next.mode, next.tier),
    });
  }
}
