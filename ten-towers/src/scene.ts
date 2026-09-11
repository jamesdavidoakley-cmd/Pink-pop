// The crystal city: four glowing columns of blocks, a night skyline, bloom.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, BlendFunction } from 'postprocessing';
import type { TowerEvent } from './tower';
import type { Place } from './number';

// Left → right on screen: thousands, hundreds, tens, ones — the same order as the digits.
export const COL_X = [12, 2, -12, -26];
const DIMS: [number, number, number][] = [[1, 1, 1], [10, 1, 1], [10, 1, 10], [10, 10, 10]];
const COLORS = [0xffb347, 0x3ee6c7, 0xd76cff, 0x8fc4ff];
const SEAM = 0.92;

type Ease = (x: number) => number;
const easeOutCubic: Ease = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut: Ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack: Ease = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

interface Tween { t: number; d: number; ease: Ease; fn: (k: number) => void; done: () => void }

interface Burst { points: THREE.Points; vel: Float32Array; life: number; max: number }

export interface Block extends THREE.Group {
  userData: { place: Place; mat: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial };
}

const geoCache = new Map<number, THREE.BoxGeometry>();
const edgeCache = new Map<number, THREE.EdgesGeometry>();

function blockGeo(place: Place): THREE.BoxGeometry {
  let g = geoCache.get(place);
  if (!g) {
    const [w, h, d] = DIMS[place];
    g = new THREE.BoxGeometry(w * SEAM, h * SEAM, d * SEAM);
    geoCache.set(place, g);
  }
  return g;
}

function edgeGeo(place: Place): THREE.EdgesGeometry {
  let g = edgeCache.get(place);
  if (!g) {
    g = new THREE.EdgesGeometry(blockGeo(place));
    edgeCache.set(place, g);
  }
  return g;
}

function makeBlock(place: Place): Block {
  const group = new THREE.Group() as Block;
  const color = new THREE.Color(COLORS[place]);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.15,
    transparent: true, opacity: 0.96,
  });
  const mesh = new THREE.Mesh(blockGeo(place), mat);
  mesh.castShadow = false;
  const edge = new THREE.LineBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.55), transparent: true, opacity: 0.9 });
  const lines = new THREE.LineSegments(edgeGeo(place), edge);
  group.add(mesh, lines);
  group.userData = { place, mat, edge };
  return group;
}

export function slotPos(place: Place, index: number): THREE.Vector3 {
  const h = DIMS[place][1];
  return new THREE.Vector3(COL_X[place], index * h + h / 2, 0);
}

/** Where the j-th smaller block sits inside a bigger block centred at `c`. */
function subPos(lower: Place, j: number, c: THREE.Vector3): THREE.Vector3 {
  const o = -4.5 + j;
  if (lower === 0) return new THREE.Vector3(c.x + o, c.y, c.z);
  if (lower === 1) return new THREE.Vector3(c.x, c.y, c.z + o);
  return new THREE.Vector3(c.x, c.y + o, c.z);
}

export class TowerScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private tweens: Tween[] = [];
  private bursts: Burst[] = [];
  private blocks: Block[][] = [[], [], [], []];
  private blockRoot = new THREE.Group();
  private landmarks = new THREE.Group();
  private camTarget = new THREE.Vector3(-7, 8, 0);
  private camPos = new THREE.Vector3(30, 30, 70);
  private lookAt = this.camTarget.clone();
  private fitHeight = 12;
  private clock = new THREE.Clock();
  private tmp = new THREE.Vector3();
  private elapsed = 0;
  private starField!: THREE.Points;
  private pads: THREE.Mesh[] = [];
  private halfLines: THREE.Mesh[] = [];
  private fitCenter = -7;
  private fitWidth = 50;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
    this.camera.position.copy(this.camPos);
    this.scene.background = new THREE.Color(0x05071a);
    this.scene.fog = new THREE.Fog(0x05071a, 90, 320);
    this.scene.add(this.blockRoot, this.landmarks);

    this.buildWorld();

    this.composer = new EffectComposer(this.renderer, { multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new BloomEffect({ luminanceThreshold: 0.55, luminanceSmoothing: 0.3, intensity: 1.35, mipmapBlur: true, radius: 0.7 });
    const vignette = new VignetteEffect({ blendFunction: BlendFunction.NORMAL, darkness: 0.55, offset: 0.25 });
    this.composer.addPass(new EffectPass(this.camera, bloom, vignette));

    this.setVisiblePlaces(4);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildWorld(): void {
    const hemi = new THREE.HemisphereLight(0x8fa0ff, 0x2a1040, 1.3);
    const key = new THREE.DirectionalLight(0xfff1d0, 1.8);
    key.position.set(30, 60, 40);
    const fill = new THREE.PointLight(0x6a5cff, 60, 120, 1.4);
    fill.position.set(-10, 25, 30);
    this.scene.add(hemi, key, fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x070a1c, roughness: 0.85, metalness: 0.2 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(600, 120, 0x2a3fa8, 0x14205a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.02;
    this.scene.add(grid);

    // Column pads — the four building plots.
    for (const p of [0, 1, 2, 3] as Place[]) {
      const [w, , d] = DIMS[p];
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(w + 2.5, 0.3, d + 2.5),
        new THREE.MeshStandardMaterial({ color: 0x0c1230, emissive: COLORS[p], emissiveIntensity: 0.28, roughness: 0.6 }),
      );
      pad.position.set(COL_X[p], 0.15, 0);
      this.scene.add(pad);
      this.pads[p] = pad;
      // The halfway line: five blocks high. Reaching it means round up.
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(w + 4, 0.14, d + 4),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.85 }),
      );
      line.position.set(COL_X[p], 5 * DIMS[p][1], 0);
      line.visible = false;
      this.scene.add(line);
      this.halfLines[p] = line;
    }

    // Stars
    const starCount = 1600;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.9 + 0.1);
      const r = 420;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }));
    this.scene.add(this.starField);

    // Skyline: dark towers with glowing windows.
    const seedRand = (() => { let s = 1234; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const buildings: { x: number; z: number; w: number; h: number; d: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const x = -220 + seedRand() * 440;
      const z = -70 - seedRand() * 150;
      if (Math.abs(x) < 40 && z > -95) continue;
      buildings.push({ x, z, w: 6 + seedRand() * 12, h: 10 + seedRand() * 55, d: 6 + seedRand() * 12 });
    }
    const bMat = new THREE.MeshStandardMaterial({ color: 0x0a0f2c, roughness: 0.9, metalness: 0.1, emissive: 0x0a1040, emissiveIntensity: 0.4 });
    const bMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bMat, buildings.length);
    const m = new THREE.Matrix4();
    let windows = 0;
    buildings.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      bMesh.setMatrixAt(i, m);
      windows += Math.floor(b.w / 1.6) * Math.floor(b.h / 2.2);
    });
    this.scene.add(bMesh);
    const winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true }), windows);
    let wi = 0;
    const tint = new THREE.Color();
    for (const b of buildings) {
      const cols = Math.floor(b.w / 1.6);
      const rows = Math.floor(b.h / 2.2);
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        if (wi >= windows) break;
        const lit = seedRand() < 0.45;
        m.compose(new THREE.Vector3(b.x - b.w / 2 + 1 + c * 1.6, 1.2 + r * 2.2, b.z + b.d / 2 + 0.05), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        winMesh.setMatrixAt(wi, m);
        tint.setHSL(0.08 + seedRand() * 0.08, 0.7, lit ? 0.55 + seedRand() * 0.35 : 0.06);
        winMesh.setColorAt(wi, tint);
        wi++;
      }
    }
    winMesh.count = wi;
    this.scene.add(winMesh);
  }

  /** Glowing landmark towers behind the plots — one per level the player has completed. */
  setLandmarks(n: number): void {
    this.landmarks.clear();
    for (let i = 0; i < n; i++) {
      const place = (i % 4) as Place;
      const x = -60 + ((i * 37) % 120);
      const z = -40 - ((i * 23) % 30);
      const h = 14 + ((i * 11) % 22);
      const color = new THREE.Color(COLORS[place]);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(4, h, 4),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3, transparent: true, opacity: 0.9 }),
      );
      mesh.position.set(x, h / 2, z);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 4), mesh.material);
      spire.position.set(x, h + 2.5, z);
      spire.rotation.y = Math.PI / 4;
      this.landmarks.add(mesh, spire);
    }
  }

  /** Show the glowing halfway line on one column (Round It), or hide it. */
  setHalfwayLine(place: Place | null): void {
    this.halfLines.forEach((l, p) => { l.visible = p === place; });
  }

  /** Show only the first n columns (3 for numbers to 100, 4 beyond) and frame them. */
  setVisiblePlaces(n: number): void {
    this.pads.forEach((pad, p) => { pad.visible = p < n; });
    const last = n - 1;
    const xmin = COL_X[last] - DIMS[last][0] / 2 - 1.25;
    const xmax = COL_X[0] + DIMS[0][0] / 2 + 1.25;
    this.fitCenter = (xmin + xmax) / 2;
    this.fitWidth = xmax - xmin + 6;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- state ---------------------------------------------------------------

  counts(): number[] {
    return this.blocks.map((b) => b.length);
  }

  /** Instantly rebuild the tower to match counts (used at round start). */
  setCounts(counts: number[]): void {
    for (const tw of this.tweens) tw.done();
    this.tweens = [];
    this.blockRoot.clear();
    this.blocks = [[], [], [], []];
    for (const p of [0, 1, 2, 3] as Place[]) {
      for (let i = 0; i < counts[p]; i++) {
        const b = makeBlock(p);
        b.position.copy(slotPos(p, i));
        this.blockRoot.add(b);
        this.blocks[p].push(b);
      }
    }
    this.refit();
  }

  private refit(): void {
    let maxH = 10;
    for (const p of [0, 1, 2, 3] as Place[]) maxH = Math.max(maxH, this.blocks[p].length * DIMS[p][1] + 4);
    this.fitHeight = maxH;
  }

  private tween(d: number, fn: (k: number) => void, ease: Ease = easeOutCubic): Promise<void> {
    return new Promise((resolve) => this.tweens.push({ t: 0, d, ease, fn, done: resolve }));
  }

  private burst(at: THREE.Vector3, color: number, count = 70, speed = 14): void {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const s = speed * (0.4 + Math.random() * 0.8);
      vel[i * 3] = s * Math.sin(ph) * Math.cos(th);
      vel[i * 3 + 1] = s * Math.cos(ph) + 4;
      vel[i * 3 + 2] = s * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.55, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, vel, life: 0, max: 0.9 });
  }

  // ---- animated events -----------------------------------------------------

  async applyEvents(events: TowerEvent[], onStart?: (e: TowerEvent) => void): Promise<void> {
    for (const e of events) {
      onStart?.(e);
      switch (e.type) {
        case 'add': await this.animAdd(e.place); break;
        case 'remove': await this.animRemove(e.place); break;
        case 'fuse': await this.animFuse(e.place); break;
        case 'smash': await this.animSmash(e.place); break;
      }
    }
  }

  private async animAdd(place: Place): Promise<void> {
    const idx = this.blocks[place].length;
    const b = makeBlock(place);
    const to = slotPos(place, idx);
    const from = to.clone().add(new THREE.Vector3(0, 14 + DIMS[place][1], 0));
    b.position.copy(from);
    b.scale.setScalar(0.3);
    this.blockRoot.add(b);
    this.blocks[place].push(b);
    this.refit();
    await this.tween(0.42, (k) => {
      b.position.lerpVectors(from, to, k);
      const s = 0.3 + 0.7 * k;
      b.scale.setScalar(s);
      b.userData.mat.emissiveIntensity = 0.45 + (1 - k) * 0.9;
    }, easeOutBack);
    b.scale.setScalar(1);
    b.position.copy(to);
  }

  private async animRemove(place: Place): Promise<void> {
    const b = this.blocks[place].pop();
    if (!b) return;
    this.refit();
    const from = b.position.clone();
    await this.tween(0.32, (k) => {
      b.position.set(from.x, from.y + k * 10, from.z);
      b.scale.setScalar(1 - k);
      b.userData.mat.opacity = 1 - k;
      b.userData.edge.opacity = 1 - k;
    });
    this.blockRoot.remove(b);
  }

  private async animFuse(place: Place): Promise<void> {
    const lower = this.blocks[place];
    const ten = lower.splice(lower.length - 10, 10);
    const upperPlace = (place + 1) as Place;
    const target = slotPos(upperPlace, this.blocks[upperPlace].length);
    const starts = ten.map((b) => b.position.clone());
    const ends = ten.map((_, j) => subPos(place, j, target));
    // Glow up, then converge into the shape of the bigger block.
    await this.tween(0.22, (k) => { for (const b of ten) b.userData.mat.emissiveIntensity = 0.45 + k * 1.6; });
    await this.tween(0.5, (k) => {
      ten.forEach((b, j) => b.position.lerpVectors(starts[j], ends[j], k));
    }, easeInOut);
    for (const b of ten) this.blockRoot.remove(b);
    const big = makeBlock(upperPlace);
    big.position.copy(target);
    big.scale.setScalar(0.6);
    this.blockRoot.add(big);
    this.blocks[upperPlace].push(big);
    this.refit();
    this.burst(target, COLORS[upperPlace], 90, 12 + place * 4);
    await this.tween(0.35, (k) => {
      big.scale.setScalar(0.6 + 0.4 * k);
      big.userData.mat.emissiveIntensity = 2 - k * 1.55;
    }, easeOutBack);
    big.scale.setScalar(1);
  }

  private async animSmash(place: Place): Promise<void> {
    const b = this.blocks[place].pop();
    if (!b) return;
    const lowerPlace = (place - 1) as Place;
    const lower = this.blocks[lowerPlace];
    const hover = new THREE.Vector3(COL_X[lowerPlace], lower.length * DIMS[lowerPlace][1] + 7 + DIMS[place][1], 0);
    const from = b.position.clone();
    await this.tween(0.45, (k) => {
      b.position.lerpVectors(from, hover, k);
      b.position.y += Math.sin(k * Math.PI) * 6;
      b.userData.mat.emissiveIntensity = 0.45 + k * 1.4;
    }, easeInOut);
    this.blockRoot.remove(b);
    this.burst(hover, COLORS[place], 110, 18);
    const pieces: Block[] = [];
    const starts: THREE.Vector3[] = [];
    const ends: THREE.Vector3[] = [];
    for (let j = 0; j < 10; j++) {
      const piece = makeBlock(lowerPlace);
      piece.position.copy(subPos(lowerPlace, j, hover));
      piece.userData.mat.emissiveIntensity = 1.4;
      this.blockRoot.add(piece);
      pieces.push(piece);
      starts.push(piece.position.clone());
      ends.push(slotPos(lowerPlace, lower.length + j));
    }
    lower.push(...pieces);
    this.refit();
    await this.tween(0.55, (k) => {
      pieces.forEach((p, j) => {
        const kk = Math.min(1, Math.max(0, (k - j * 0.04) / 0.64));
        const e = easeOutCubic(kk);
        p.position.lerpVectors(starts[j], ends[j], e);
        p.userData.mat.emissiveIntensity = 1.4 - e * 0.95;
      });
    }, (x) => x);
    pieces.forEach((p, j) => p.position.copy(ends[j]));
  }

  /** Flash the whole tower and shoot sparkles from every column top. */
  async celebrate(): Promise<void> {
    for (const p of [0, 1, 2, 3] as Place[]) {
      const n = this.blocks[p].length;
      if (n) this.burst(slotPos(p, n - 1).add(new THREE.Vector3(0, DIMS[p][1], 0)), COLORS[p], 120, 16);
    }
    const all = this.blocks.flat();
    await this.tween(1.1, (k) => {
      const glow = Math.sin(k * Math.PI);
      for (const b of all) b.userData.mat.emissiveIntensity = 0.45 + glow * 1.5;
    }, (x) => x);
  }

  /** Nudge a column to say "nothing here". */
  async shake(place: Place): Promise<void> {
    const col = this.blocks[place];
    const base = col.map((b) => b.position.x);
    await this.tween(0.4, (k) => {
      const dx = Math.sin(k * Math.PI * 6) * (1 - k) * 0.8;
      col.forEach((b, i) => { b.position.x = base[i] + dx; });
    }, (x) => x);
    col.forEach((b, i) => { b.position.x = base[i]; });
  }

  /** True when no animation is in flight (used by headless checks). */
  isIdle(): boolean {
    return this.tweens.length === 0;
  }

  // ---- per-frame -----------------------------------------------------------

  worldToScreen(v: THREE.Vector3): { x: number; y: number } {
    this.tmp.copy(v).project(this.camera);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    return { x: (this.tmp.x + 1) / 2 * w, y: (1 - this.tmp.y) / 2 * h };
  }

  columnScreenX(place: Place): number {
    return this.worldToScreen(new THREE.Vector3(COL_X[place], 0, 6)).x;
  }

  render(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    // Tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.fn(tw.ease(k));
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done();
      }
    }

    // Bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life += dt;
      const attr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += b.vel[j] * dt;
        arr[j + 1] += b.vel[j + 1] * dt;
        arr[j + 2] += b.vel[j + 2] * dt;
        b.vel[j + 1] -= 22 * dt;
      }
      attr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = 1 - b.life / b.max;
      if (b.life >= b.max) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        this.bursts.splice(i, 1);
      }
    }

    // Camera framing: fit the plots' width and the tallest column.
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const width = this.fitWidth;
    const height = this.fitHeight + 6;
    const dist = Math.max((width / 2) / Math.tan(hfov / 2), (height / 2) / Math.tan(vfov / 2)) * (this.camera.aspect < 1 ? 1.25 : 1.05) + 9;
    const yaw = THREE.MathUtils.degToRad(22);
    const pitch = THREE.MathUtils.degToRad(17);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.camTarget.set(this.fitCenter, Math.max(5, this.fitHeight * 0.36), 0);
    this.camPos.copy(this.camTarget).addScaledVector(dir, dist);
    this.camera.position.lerp(this.camPos, 1 - Math.pow(0.02, dt));
    this.lookAt.lerp(this.camTarget, 1 - Math.pow(0.02, dt));
    this.camera.lookAt(this.lookAt);

    // Idle shimmer on blocks.
    const shimmer = 0.45 + Math.sin(this.elapsed * 2.2) * 0.07;
    if (this.tweens.length === 0) for (const b of this.blocks.flat()) b.userData.mat.emissiveIntensity = shimmer;
    this.starField.rotation.y = this.elapsed * 0.004;
    for (const l of this.halfLines) if (l.visible) (l.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.elapsed * 4) * 0.3;

    this.composer.render(dt);
  }
}
