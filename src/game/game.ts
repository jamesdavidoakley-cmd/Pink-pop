import * as THREE from 'three';
import type { Content } from '../engine/loader';
import { makeStrings } from '../engine/loader';
import { RendererSystem, type Quality } from '../engine/renderer';
import { Input } from '../engine/input';
import { audio } from '../engine/audio';
import { tts } from '../engine/tts';
import { DialogueEngine } from './dialogue/engine';
import { PlayScene, type SceneServices } from './world/playScene';

/**
 * P1 shell: boots straight into a playable level (?level=…, default playground)
 * with a debug HUD. The full screen flow (title → hub → worlds) lands in P3.
 */
export class Game {
  private rendererSys: RendererSystem;
  private input: Input;
  private clock = new THREE.Clock();
  private scene: PlayScene | null = null;
  private services: SceneServices;
  private hud: HTMLDivElement;
  readonly uiRoot!: HTMLDivElement;
  private fpsSamples: number[] = [];
  private probeDone = false;

  constructor(container: HTMLElement, private content: Content) {
    this.rendererSys = new RendererSystem(container);
    this.input = new Input();
    const uiRoot = document.createElement('div');
    uiRoot.className = 'ui-root subtitle-size-medium';
    container.appendChild(uiRoot);
    this.uiRoot = uiRoot;
    const strings = makeStrings(content);
    this.services = {
      content,
      strings,
      renderer: this.rendererSys,
      input: this.input,
      audio,
      dialogue: new DialogueEngine(content, strings, tts, audio, uiRoot),
    };
    // audio requires a user gesture
    const unlock = () => { audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });

    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;top:8px;left:10px;color:#fff;font:14px/1.4 system-ui;'
      + 'text-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none;z-index:10;white-space:pre;';
    container.appendChild(this.hud);
  }

  start(): void {
    const params = new URLSearchParams(location.search);
    const levelId = params.get('level') ?? 'playground';
    this.scene = new PlayScene(this.services, levelId);
    (window as unknown as { __game: unknown }).__game = {
      scene: this.scene,
      player: this.scene.player,
      dialogue: this.services.dialogue,
      goto: (id: string) => this.gotoLevel(id),
    };
    if (params.get('demo') === 'voices') {
      void this.services.dialogue.playCutscene('intro');
    }
    this.loop();
  }

  gotoLevel(id: string): void {
    this.scene?.dispose();
    this.scene = new PlayScene(this.services, id);
  }

  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update(dt);
    this.services.dialogue.update(dt);
    this.scene?.update(dt);
    this.rendererSys.render(dt);
    this.input.endFrame();

    // fps + auto quality probe
    const fps = dt > 0 ? 1 / dt : 60;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 180) this.fpsSamples.shift();
    if (!this.probeDone && this.fpsSamples.length === 180) {
      this.probeDone = true;
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / 180;
      const cfg = this.content.config.quality;
      const q: Quality = avg < cfg.lowFpsThreshold ? 'low' : avg < 56 ? 'medium' : 'high';
      this.rendererSys.setQuality(q);
    }
    const avgFps = Math.round(this.fpsSamples.reduce((a, b) => a + b, 0) / Math.max(1, this.fpsSamples.length));
    if (this.scene) {
      this.hud.textContent = `${avgFps} fps · ${this.rendererSys.quality}\nAmber Chips: ${this.scene.chipsCollected}\nHearts: ${'♥'.repeat(Math.ceil(this.scene.player.hearts))}`;
    }
    requestAnimationFrame(this.loop);
  };
}
