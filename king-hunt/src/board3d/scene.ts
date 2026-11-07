import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, VignetteEffect } from 'postprocessing';
import { PALETTE } from './palette';
import { TILE, squareToWorld } from './coords';
import { sq, type Square } from '../chess/types';
import { Director } from './director';
import { stoneTexture } from './pieces';
import { BoardLabels } from './labels';
import { resolveQuality, qualityFromStorage, type QualityPreset } from './quality';

export interface Tile {
  square: Square;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  base: THREE.Color;
}

export class BoardScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly tiles = new Map<Square, Tile>();
  readonly piecesGroup = new THREE.Group();
  readonly fxGroup = new THREE.Group();
  readonly director: Director;
  readonly labels: BoardLabels;
  readonly quality: QualityPreset;
  private clock = new THREE.Clock();
  private tickers = new Set<(dt: number, t: number, realDt: number) => void>();
  private orientation: 'w' | 'b' = 'w';
  private camTarget = new THREE.Vector3(0, 8.6, 8.2);
  private liftPx = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.quality = resolveQuality(qualityFromStorage());
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene.background = new THREE.Color(PALETTE.background);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 12, 26);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 8.6, 8.2);
    this.camera.lookAt(0, -0.4, 0);

    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a1020, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(-5, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.05; // no acne stripes on the curved pieces
    key.shadow.radius = 3;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6aa0ff, 0.8);
    rim.position.set(6, 4, -8);
    this.scene.add(rim);

    this.buildBoard();
    this.scene.add(this.piecesGroup, this.fxGroup);
    this.labels = new BoardLabels(this.scene);
    this.director = new Director(this.camera);
    this.director.onFinish = () => this.restoreFraming();

    this.composer = new EffectComposer(this.renderer, { multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new BloomEffect({ intensity: this.quality.bloom, luminanceThreshold: 0.5, luminanceSmoothing: 0.25, mipmapBlur: true });
    const vignette = new VignetteEffect({ darkness: 0.55, offset: 0.25 });
    this.composer.addPass(this.quality.smaa ? new EffectPass(this.camera, bloom, vignette, new SMAAEffect()) : new EffectPass(this.camera, bloom, vignette));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildBoard() {
    const geo = new THREE.BoxGeometry(TILE, 0.18, TILE);
    const grain = stoneTexture(128, 0.35);
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const s = sq(f, r);
        const light = (f + r) % 2 === 1;
        const base = new THREE.Color(light ? PALETTE.tileLight : PALETTE.tileDark);
        const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.8, metalness: 0.02, emissive: 0x000000, bumpMap: grain, bumpScale: 0.01, roughnessMap: grain });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(squareToWorld(s, -0.09));
        mesh.receiveShadow = true;
        mesh.userData = { kind: 'tile', square: s };
        this.scene.add(mesh);
        this.tiles.set(s, { square: s, mesh, base });
      }
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8 * TILE + 1.1, 0.3, 8 * TILE + 1.1),
      new THREE.MeshStandardMaterial({ color: PALETTE.frame, roughness: 0.4, metalness: 0.3 }),
    );
    frame.position.y = -0.24;
    frame.receiveShadow = true;
    this.scene.add(frame);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: 0x070a14, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  /** Camera height/distance for the current aspect: phones look more top-down so the far rank fits. */
  private framing() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect < 0.8) return { y: 11.6, z: 5.6 };
    if (aspect < 1.1) return { y: 10.0, z: 7.0 };
    return { y: 8.6, z: 8.2 };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const f = this.framing();
    this.camTarget.set(0, f.y, this.orientation === 'w' ? f.z : -f.z);
    this.camera.position.copy(this.camTarget);
    this.camera.lookAt(0, -0.4, 0);
    this.applyProjection();
  }

  /** Snaps back to the normal framing after a cut scene. */
  restoreFraming() {
    const f = this.framing();
    this.camTarget.set(0, f.y, this.orientation === 'w' ? f.z : -f.z);
    this.camera.position.copy(this.camTarget);
    this.camera.lookAt(0, -0.4, 0);
    this.applyProjection();
  }

  /** Shifts the picture up by `px` screen pixels (used while a card covers the bottom of the screen). */
  setLift(px: number) {
    // On wide screens the far rank already sits near the top bar, so the lift is capped there;
    // portrait screens have room above the board and take the full lift.
    const h = window.innerHeight;
    const cap = window.innerWidth / h < 1.1 ? h * 0.5 : h * 0.07;
    this.liftPx = Math.max(0, Math.round(Math.min(px, cap)));
    this.applyProjection();
  }

  /**
   * Projection for the current screen and lift. The camera renders the bottom `h` pixels of a
   * virtual frame `h + lift` tall, so the board sits higher on screen while a card is open.
   * Aspect and FOV are those of the full virtual frame (what setViewOffset expects). The vertical
   * FOV is derived from the horizontal angle the board needs at the camera's distance, so the whole
   * board fits on any screen shape, and never goes narrower than 42°.
   */
  private applyProjection() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fullH = h + this.liftPx;
    const aspect = w / fullH;
    const f = this.framing();
    const dist = Math.hypot(f.y + 0.4, f.z);
    const halfWidth = 5.5; // board + frame + labels + a little air
    const fovX = 2 * Math.atan(halfWidth / dist);
    const fovY = (2 * Math.atan(Math.tan(fovX / 2) / aspect) * 180) / Math.PI;
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(100, Math.max(44, fovY));
    if (this.liftPx > 0) this.camera.setViewOffset(w, fullH, 0, this.liftPx, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Which side sits at the bottom of the screen. The camera swings round smoothly. */
  setOrientation(side: 'w' | 'b') {
    this.orientation = side;
    const f = this.framing();
    this.camTarget.set(0, f.y, side === 'w' ? f.z : -f.z);
  }
  getOrientation() {
    return this.orientation;
  }

  onTick(fn: (dt: number, t: number, realDt: number) => void) {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  start() {
    const loop = () => {
      const realDt = this.clock.getDelta();
      const dt = Math.min(realDt, 0.05);
      const t = this.clock.elapsedTime;
      for (const fn of this.tickers) fn(dt, t, Math.min(realDt, 0.25));
      // Cut scenes run on wall-clock time so they last as designed on slow devices.
      const driven = this.director.update(Math.min(realDt, 0.5));
      if (!driven && !this.director.active && this.camera.position.distanceToSquared(this.camTarget) > 1e-4) {
        // Swing around the board rather than cutting through it.
        const cur = this.camera.position;
        const angleNow = Math.atan2(cur.x, cur.z);
        const angleTo = Math.atan2(this.camTarget.x, this.camTarget.z);
        let d = angleTo - angleNow;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const a = angleNow + d * Math.min(1, dt * 4);
        const r = Math.hypot(this.camTarget.x, this.camTarget.z);
        cur.set(Math.sin(a) * r, this.camTarget.y, Math.cos(a) * r);
        if (Math.abs(d) < 0.002) cur.copy(this.camTarget);
        this.camera.lookAt(0, -0.4, 0);
      }
      this.composer.render(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
