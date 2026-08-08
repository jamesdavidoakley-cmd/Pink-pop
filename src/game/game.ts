import * as THREE from 'three';
import type { Content } from '../engine/loader';
import { makeStrings, type Strings } from '../engine/loader';
import { RendererSystem, type Quality } from '../engine/renderer';
import { Input } from '../engine/input';
import { audio } from '../engine/audio';
import { tts } from '../engine/tts';
import { saves, freshSave, type Settings } from '../engine/save';
import { DialogueEngine } from './dialogue/engine';
import { PlayScene, type SceneServices } from './world/playScene';
import { Session } from './session';
import { Hud } from './ui/hud';
import { MenuHost } from './ui/menus';
import type { PortalDef } from '../engine/types';

/**
 * Screen flow: title (slots) → hub → worlds, with pause, settings that apply
 * live, loading screens that teach, and autosaving persistence.
 */
export class Game {
  private rendererSys: RendererSystem;
  private input: Input;
  private clock = new THREE.Clock();
  private scene: PlayScene | null = null;
  private session: Session | null = null;
  private settings: Settings;
  private strings: Strings;
  private hud: Hud;
  private menus: MenuHost;
  private dialogue: DialogueEngine;
  private uiRoot: HTMLDivElement;
  private state: 'title' | 'playing' = 'title';
  private fpsSamples: number[] = [];
  private probeDone = false;
  private focusFossilId: string | null = null;
  private breakT = 0;

  constructor(container: HTMLElement, private content: Content) {
    this.rendererSys = new RendererSystem(container);
    this.input = new Input();
    this.strings = makeStrings(content);
    this.settings = saves.loadSettings();

    this.uiRoot = document.createElement('div');
    this.uiRoot.className = 'ui-root subtitle-size-medium';
    container.appendChild(this.uiRoot);

    this.dialogue = new DialogueEngine(content, this.strings, tts, audio, this.uiRoot);
    this.hud = new Hud(this.uiRoot, this.strings);
    this.hud.setVisible(false);
    this.menus = new MenuHost(this.uiRoot, content, this.strings);
    this.menus.speakUi = (text) => {
      if (this.settings.readMenus) void tts.speak(this.content.characters.kenji, text);
    };

    const unlock = (): void => { audio.unlock(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.applySettings();
  }

  // ---------------- boot ----------------
  start(): void {
    const params = new URLSearchParams(location.search);
    const debugLevel = params.get('level');
    if (debugLevel) {
      // debug boot: straight into a level on a scratch slot
      const slot = Number(params.get('slot') ?? 0);
      this.beginSession(slot, saves.load(slot) === null, debugLevel, params.get('demo') === 'voices');
    } else {
      this.showTitle();
    }
    this.loop();
  }

  private showTitle(): void {
    this.state = 'title';
    this.hud.setVisible(false);
    this.scene?.dispose();
    this.scene = null;
    this.session = null;
    audio.stopMusic();
    this.menus.showTitle({
      onPlay: (slot, fresh) => this.beginSession(slot, fresh),
      onSettings: () => this.menus.showSettings(this.settings, null, () => this.applySettings(), () => this.showTitle()),
    });
  }

  private beginSession(slot: number, fresh: boolean, debugLevel?: string, voiceDemo = false): void {
    const data = fresh ? freshSave() : saves.load(slot) ?? freshSave();
    this.session = new Session(slot, data, this.settings, this.content);
    if (fresh) this.session.save();
    this.dialogue.attachMemory(data.voice);
    this.state = 'playing';
    this.menus.close();
    this.hud.setVisible(true);
    this.enterLevel(debugLevel ?? data.lastLevel ?? 'hub', () => {
      if ((fresh && !debugLevel) || voiceDemo) {
        void this.dialogue.playCutscene('intro');
      }
    });
    this.exposeDebug();
  }

  // ---------------- level flow ----------------
  enterLevel(levelId: string, after?: () => void): void {
    if (!this.session) return;
    const def = this.content.levels[levelId];
    if (!def) { console.error(`unknown level ${levelId}`); return; }
    const fact = this.pickFact(levelId);
    const dismiss = this.menus.showLoading(this.strings.get(def.nameKey), fact);
    // let the loading screen paint before the (synchronous) build
    setTimeout(() => {
      this.scene?.dispose();
      this.scene = new PlayScene(this.services(), levelId, { focusFossilId: this.focusFossilId });
      this.focusFossilId = null;
      this.session!.data.lastLevel = levelId;
      this.session!.save();
      this.applySceneSettings();
      dismiss();
      after?.();
      this.exposeDebug();
    }, 60);
  }

  private services(): SceneServices {
    return {
      content: this.content,
      strings: this.strings,
      renderer: this.rendererSys,
      input: this.input,
      audio,
      dialogue: this.dialogue,
      session: this.session!,
      hud: this.hud,
      onPortal: (p) => this.handlePortal(p),
      isUiBlocked: () => this.menus.open,
    };
  }

  private handlePortal(portal: PortalDef): void {
    const target = this.content.levels[portal.to];
    if (!target || !this.session) return;
    if (target.kind === 'world') {
      this.menus.showFossilSelect(target, this.session, {
        onEnter: (focus) => {
          this.focusFossilId = focus;
          this.menus.close();
          this.enterLevel(portal.to);
        },
        onCancel: () => this.menus.close(),
        speakHint: (speaker, hint) => void this.dialogue.sayText(speaker, hint),
      });
    } else {
      this.enterLevel(portal.to);
    }
  }

  private pickFact(levelId: string): string | null {
    const topicByLevel: Record<string, string[]> = {
      w1: ['rocks-soils', 'skeletons', 'place-value'],
      w2: ['gears-levers', 'times-tables', 'symmetry', 'circuits'],
      hub: ['place-value', 'rocks-soils', 'gears-levers', 'times-tables', 'measurement', 'roman-numerals'],
    };
    const topics = topicByLevel[levelId] ?? topicByLevel.hub;
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const keys = Object.keys(this.content.strings).filter((k) => k.startsWith(`fact.${topic}.`));
    if (!keys.length) return null;
    return this.strings.get(keys[Math.floor(Math.random() * keys.length)]);
  }

  // ---------------- pause & settings ----------------
  private showPause(): void {
    if (!this.session || !this.scene) return;
    this.menus.showPause({
      onResume: () => this.menus.close(),
      onMap: () => this.showMap(),
      onAskDigger: () => {
        this.menus.close();
        const hint = this.contextHint();
        void this.dialogue.sayText('digger', hint);
      },
      onSettings: () => this.menus.showSettings(this.settings, this.session, () => this.applySettings(), () => this.showPause()),
      onGrownUps: () => this.showGrownUps(),
      onQuit: () => { this.session?.save(); this.showTitle(); },
    });
  }

  private contextHint(): string {
    const def = this.scene!.def;
    const next = (def.fossils ?? []).find((f) => !this.session!.hasFossil(f.id) && f.hint);
    if (next?.hint) return next.hint;
    if (def.kind === 'hub') {
      const worlds = this.content.worlds;
      const open = worlds.find((w) => this.session!.doorOpen(w.gateKey ?? ''));
      if (open) return `Reckon we should try the ${this.strings.get(open.nameKey)} door, mate!`;
    }
    return 'Reckon we should have a squiz around — something shiny always turns up!';
  }

  private showMap(): void {
    // star map: mastery constellations (fills with life from P4's education engine)
    this.menus.showPanel((panel, host) => {
      panel.innerHTML = `<h2>${this.strings.get('menu.map')}</h2>`;
      const grid = document.createElement('div');
      grid.className = 'constellation';
      const topics = Object.keys(this.session!.data.mastery);
      if (!topics.length) {
        const p = document.createElement('div');
        p.className = 'menu-note';
        p.textContent = 'Answer questions out in the worlds and constellations of mastery will appear here!';
        panel.appendChild(p);
      }
      for (const t of topics) {
        const stars = this.session!.stars(t);
        const card = document.createElement('div');
        card.className = 'topic-card';
        card.innerHTML = `<div class="name">${this.strings.get(`topic.${t}`)}</div>`
          + `<div class="stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>`;
        grid.appendChild(card);
      }
      panel.appendChild(grid);
      panel.appendChild(host.makeButton(this.strings.get('menu.back'), () => this.showPause()));
    });
  }

  private showGrownUps(): void {
    this.menus.showPanel((panel, host) => {
      const s = this.strings;
      const sess = this.session!;
      panel.innerHTML = `<h2>${esc(s.get('grownups.title'))}</h2>`
        + `<div class="menu-note" style="text-align:left">${esc(s.get('grownups.intro', { name: this.content.characters.max.name }))}</div>`
        + `<div class="setting-row">${esc(s.get('grownups.playtime', { time: fmtTime(sess.data.playtimeSeconds) }))}</div>`;
      const grid = document.createElement('div');
      grid.className = 'constellation';
      const topics = Object.keys(sess.data.mastery);
      for (const t of topics) {
        const stars = sess.stars(t);
        const tp = sess.data.mastery[t];
        const acc = tp.attempts ? Math.round((tp.correct / tp.attempts) * 100) : 0;
        const card = document.createElement('div');
        card.className = 'topic-card';
        card.innerHTML = `<div class="name">${esc(s.get(`topic.${t}`))}</div>`
          + `<div class="stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>`
          + `<div class="note">${esc(s.get(`grownups.stars${stars}`))} · Tier ${tp.tier} · ${acc}% correct of ${tp.attempts}</div>`;
        grid.appendChild(card);
      }
      if (!topics.length) {
        const p = document.createElement('div');
        p.className = 'menu-note';
        p.textContent = 'No topics practised yet — progress appears here as they play.';
        panel.appendChild(p);
      }
      panel.appendChild(grid);
      // gentle break reminder
      const row = document.createElement('div');
      row.className = 'setting-row';
      const label = document.createElement('span');
      label.textContent = s.get('grownups.reminder', { mins: this.settings.breakReminderMins || '—' });
      const sel = document.createElement('select');
      for (const [v, l] of [['0', s.get('grownups.reminderOff')], ['20', '20'], ['30', '30'], ['45', '45'], ['60', '60']]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = l;
        sel.appendChild(o);
      }
      sel.value = String(this.settings.breakReminderMins);
      sel.addEventListener('change', () => { this.settings.breakReminderMins = Number(sel.value); this.applySettings(); });
      row.append(label, sel);
      panel.appendChild(row);
      panel.appendChild(host.makeButton(s.get('menu.back'), () => this.showPause()));
    });
  }

  applySettings(): void {
    saves.saveSettings(this.settings);
    audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);
    tts.voiceOn = this.settings.voiceOn;
    tts.rateMultiplier = this.settings.speechRate;
    this.uiRoot.classList.toggle('dyslexia', this.settings.dyslexiaFont);
    this.uiRoot.classList.toggle('color-safe', this.settings.colorSafe);
    this.uiRoot.classList.toggle('reduce-flash', this.settings.reduceFlash);
    this.uiRoot.classList.remove('subtitle-size-small', 'subtitle-size-medium', 'subtitle-size-large');
    this.uiRoot.classList.add(`subtitle-size-${this.settings.subtitleSize}`);
    this.rendererSys.reduceShake = this.settings.reduceShake;
    this.rendererSys.reduceFlash = this.settings.reduceFlash;
    if (this.settings.quality !== 'auto') this.rendererSys.setQuality(this.settings.quality as Quality);
    this.applySceneSettings();
  }

  private applySceneSettings(): void {
    if (!this.scene) return;
    this.scene.cameraRig.invertY = this.settings.invertY;
    this.scene.cameraRig.sensitivity = this.settings.sensitivity;
  }

  private exposeDebug(): void {
    (window as unknown as { __game: unknown }).__game = {
      scene: this.scene,
      player: this.scene?.player,
      dialogue: this.dialogue,
      session: this.session,
      menus: this.menus,
      goto: (id: string) => this.enterLevel(id),
      give: (fossilId: string) => this.scene?.awardFossil(fossilId),
    };
  }

  // ---------------- main loop ----------------
  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update(dt);
    this.dialogue.update(dt);

    if (this.state === 'playing' && this.session && this.scene) {
      if (!this.menus.open) {
        this.input.enabled = true;
        this.scene.update(dt);
        this.session.tick(dt);
        // break reminder (Grown-Ups' Corner option)
        if (this.settings.breakReminderMins > 0) {
          this.breakT += dt;
          if (this.breakT > this.settings.breakReminderMins * 60) {
            this.breakT = 0;
            this.hud.toast(this.strings.get('break.body'), 7);
          }
        }
        if (this.input.pressed('pause')) this.showPause();
      } else {
        this.input.enabled = false;
      }
      this.hud.update(this.session, this.scene.player, this.content.totalFossils);
    }

    this.rendererSys.render(dt);
    this.input.endFrame();

    // fps probe → auto quality
    const fps = dt > 0 ? 1 / dt : 60;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 180) this.fpsSamples.shift();
    if (!this.probeDone && this.fpsSamples.length === 180 && this.settings.quality === 'auto') {
      this.probeDone = true;
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / 180;
      const q: Quality = avg < this.content.config.quality.lowFpsThreshold ? 'low' : avg < 56 ? 'medium' : 'high';
      this.rendererSys.setQuality(q);
    }
    requestAnimationFrame(this.loop);
  };
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
