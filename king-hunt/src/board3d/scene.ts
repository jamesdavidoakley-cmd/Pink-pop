import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, VignetteEffect } from 'postprocessing';
import { PALETTE } from './palette';
import { TILE, squareToWorld } from './coords';
import { sq, type Square } from '../chess/types';

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
  private clock = new THREE.Clock();
  private tickers = new Set<(dt: number, t: number) => void>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(PALETTE.background);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 14, 30);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 8.6, 8.2);
    this.camera.lookAt(0, -0.4, 0);

    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a1020, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(-5, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0006;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6aa0ff, 0.8);
    rim.position.set(6, 4, -8);
    this.scene.add(rim);

    this.buildBoard();
    this.scene.add(this.piecesGroup, this.fxGroup);

    this.composer = new EffectComposer(this.renderer, { multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new BloomEffect({ intensity: 0.9, luminanceThreshold: 0.55, luminanceSmoothing: 0.2, mipmapBlur: true });
    const vignette = new VignetteEffect({ darkness: 0.55, offset: 0.25 });
    this.composer.addPass(new EffectPass(this.camera, bloom, vignette, new SMAAEffect()));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildBoard() {
    const geo = new THREE.BoxGeometry(TILE, 0.18, TILE);
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const s = sq(f, r);
        const light = (f + r) % 2 === 1;
        const base = new THREE.Color(light ? PALETTE.tileLight : PALETTE.tileDark);
        const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.05, emissive: 0x000000 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(squareToWorld(s, -0.09));
        mesh.receiveShadow = true;
        mesh.userData = { kind: 'tile', square: s };
        this.scene.add(mesh);
        this.tiles.set(s, { square: s, mesh, base });
      }
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8 * TILE + 0.7, 0.3, 8 * TILE + 0.7),
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

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait screens (tablets) need a wider view to keep the whole board on.
    this.camera.fov = w < h ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  onTick(fn: (dt: number, t: number) => void) {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  start() {
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      for (const fn of this.tickers) fn(dt, t);
      this.composer.render(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
