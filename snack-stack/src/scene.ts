// The crystal city: four glowing columns of blocks, a night skyline, bloom.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, BlendFunction } from 'postprocessing';
import type { TowerEvent } from './tower';
import type { Place } from './number';

// Left → right on screen: thousands, hundreds, tens, ones, the same order as the digits.
export const COL_X = [12, 2, -12, -26];
const DIMS: [number, number, number][] = [[1, 1, 1], [10, 1, 1], [10, 1, 10], [10, 10, 10]];
const COLORS = [0xf2b24a, 0xff5c7a, 0x4fb3ff, 0xc98a4b];
/** Resting glow. Food should look lit, not neon. */
const BASE_GLOW = 0.12;
const SEAM = 0.92;

type Ease = (x: number) => number;
const easeOutCubic: Ease = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut: Ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack: Ease = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

interface Tween { t: number; d: number; ease: Ease; fn: (k: number) => void; done: () => void }

interface Burst { points: THREE.Points; vel: Float32Array; life: number; max: number }

interface Debris { obj: THREE.Object3D; vel: THREE.Vector3; ang: THREE.Vector3; life: number }

const WALL_Z = -27;
const BRICK = 3;
const WALL_COLS = 12;
const WALL_ROWS = 7;
const easeInCubic: Ease = (x) => x * x * x;

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

const cookieGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.86, 28);
const chipGeo = new THREE.SphereGeometry(0.09, 8, 6);
const chipMat = new THREE.MeshStandardMaterial({ color: 0x4a2a12, roughness: 0.6 });
const packGeo = new THREE.CylinderGeometry(0.48, 0.48, 9.86, 28);
const packEndGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 24);
const labelGeo = new THREE.CylinderGeometry(0.5, 0.5, 2.6, 28);
const labelMat = new THREE.MeshStandardMaterial({ color: 0xfff5e6, roughness: 0.6 });
const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfff5e6, roughness: 0.6 });
const cookieMatShared = new THREE.MeshStandardMaterial({ color: 0xf2b24a, roughness: 0.8 });
const slatMat = new THREE.MeshStandardMaterial({ color: 0x7a4a1e, roughness: 0.9 });

/** Cookie (1), pack of ten (10), box of ten packs (100), crate of ten boxes (1,000). */
function makeBlock(place: Place): Block {
  const group = new THREE.Group() as Block;
  const color = new THREE.Color(COLORS[place]);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: BASE_GLOW, roughness: place === 0 ? 0.75 : place === 3 ? 0.85 : 0.45, metalness: 0.02,
    transparent: true, opacity: 1,
  });
  const edge = new THREE.LineBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.5), transparent: true, opacity: 0.8 });
  if (place === 0) {
    const cookie = new THREE.Mesh(cookieGeo, mat);
    group.add(cookie);
    for (let i = 0; i < 5; i++) {
      const chip = new THREE.Mesh(chipGeo, chipMat);
      const a = (i / 5) * Math.PI * 2 + 0.7; const r = 0.12 + (i % 2) * 0.16;
      chip.position.set(Math.cos(a) * r, 0.43, Math.sin(a) * r);
      group.add(chip);
    }
  } else if (place === 1) {
    const tube = new THREE.Mesh(packGeo, mat);
    tube.rotation.z = Math.PI / 2;
    group.add(tube);
    for (const x of [-4.96, 4.96]) {
      const end = new THREE.Mesh(packEndGeo, cookieMatShared);
      end.rotation.z = Math.PI / 2; end.position.x = x;
      group.add(end);
    }
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.z = Math.PI / 2;
    group.add(label);
    for (const x of [-3.6, 3.6]) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.5, 28), stripeMat);
      stripe.rotation.z = Math.PI / 2; stripe.position.x = x;
      group.add(stripe);
    }
  } else if (place === 2) {
    const box = new THREE.Mesh(blockGeo(2), mat);
    group.add(box, new THREE.LineSegments(edgeGeo(2), edge));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 3.2), labelMat);
    lid.position.y = 0.47;
    group.add(lid);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.05, 1.2), stripeMat);
    tape.position.y = 0.47;
    group.add(tape);
  } else {
    const crate = new THREE.Mesh(blockGeo(3), mat);
    group.add(crate, new THREE.LineSegments(edgeGeo(3), edge));
    for (const y of [-3.3, 0, 3.3]) {
      for (const [dx, dz, rot] of [[0, 4.6, 0], [0, -4.6, 0], [4.6, 0, Math.PI / 2], [-4.6, 0, Math.PI / 2]] as [number, number, number][]) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.5, 0.35), slatMat);
        slat.position.set(dx, y, dz); slat.rotation.y = rot;
        group.add(slat);
      }
    }
    const stamp = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 0.1), labelMat);
    stamp.position.set(0, 1.6, 4.62);
    group.add(stamp);
  }
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
  private debris: Debris[] = [];
  private wall: { group: THREE.Group; top: THREE.Mesh; bottom: THREE.Mesh; eyes: THREE.Group; pupils: THREE.Mesh[]; mat: THREE.MeshStandardMaterial } | null = null;
  private finaleShift = 0;
  private fitCenter = -7;
  private fitWidth = 50;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
    this.camera.position.copy(this.camPos);
    this.scene.background = new THREE.Color(0xffe9d2);
    this.scene.fog = new THREE.Fog(0xffe9d2, 120, 420);
    this.scene.add(this.blockRoot, this.landmarks);

    this.buildWorld();

    this.composer = new EffectComposer(this.renderer, { multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new BloomEffect({ luminanceThreshold: 0.85, luminanceSmoothing: 0.25, intensity: 0.9, mipmapBlur: true, radius: 0.6 });
    const vignette = new VignetteEffect({ blendFunction: BlendFunction.NORMAL, darkness: 0.35, offset: 0.3 });
    this.composer.addPass(new EffectPass(this.camera, bloom, vignette));

    this.setVisiblePlaces(4);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildWorld(): void {
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0xd9b48c, 1.4);
    const key = new THREE.DirectionalLight(0xfff1d0, 2.0);
    key.position.set(30, 60, 40);
    const fill = new THREE.PointLight(0xffd6a0, 40, 140, 1.2);
    fill.position.set(-10, 25, 30);
    this.scene.add(hemi, key, fill);

    // The counter: warm wooden planks.
    const counter = new THREE.Mesh(new THREE.BoxGeometry(900, 2, 900), new THREE.MeshStandardMaterial({ color: 0xc2895a, roughness: 0.85 }));
    counter.position.y = -1;
    this.scene.add(counter);
    const plankLines: number[] = [];
    for (let x = -300; x <= 300; x += 6) plankLines.push(x, 0.03, -300, x, 0.03, 300);
    const plankGeo = new THREE.BufferGeometry();
    plankGeo.setAttribute('position', new THREE.Float32BufferAttribute(plankLines, 3));
    this.scene.add(new THREE.LineSegments(plankGeo, new THREE.LineBasicMaterial({ color: 0x8a5a33, transparent: true, opacity: 0.55 })));

    // Plates for the four plots.
    for (const p of [0, 1, 2, 3] as Place[]) {
      const [w, , d] = DIMS[p];
      const r = Math.max(w, d) / 2 + 1.8;
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.9, 0.3, 48),
        new THREE.MeshStandardMaterial({ color: 0xfffaf2, emissive: COLORS[p], emissiveIntensity: 0.08, roughness: 0.35 }),
      );
      plate.position.set(COL_X[p], 0.15, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.25, 0.14, 8, 48), new THREE.MeshStandardMaterial({ color: COLORS[p], roughness: 0.5 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.3;
      plate.add(rim);
      this.scene.add(plate);
      this.pads[p] = plate;
      // The halfway line: five high. Reaching it means round up.
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(w + 4, 0.14, d + 4),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.85 }),
      );
      line.position.set(COL_X[p], 5 * DIMS[p][1], 0);
      line.visible = false;
      this.scene.add(line);
      this.halfLines[p] = line;
    }

    // Sprinkles drifting in the air.
    const n = 900;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 360;
      pos[i * 3 + 1] = 5 + Math.random() * 120;
      pos[i * 3 + 2] = -20 - Math.random() * 200;
      tint.setHSL(Math.random(), 0.85, 0.65);
      col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starField = new THREE.Points(geo, new THREE.PointsMaterial({ vertexColors: true, size: 1.2, transparent: true, opacity: 0.9, fog: true }));
    this.scene.add(this.starField);

    // The back wall with shelves of jars and cakes.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), new THREE.MeshStandardMaterial({ color: 0xffe0c2, roughness: 1 }));
    wall.position.set(0, 120, -130);
    this.scene.add(wall);
    const seedRand = (() => { let sd = 4321; return () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }; })();
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0xa8683c, roughness: 0.8 });
    for (const y of [22, 40, 58]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(320, 1.6, 12), shelfMat);
      shelf.position.set(0, y, -118);
      this.scene.add(shelf);
      for (let x = -150; x <= 150; x += 10 + seedRand() * 8) {
        const kind = seedRand();
        const hue = seedRand();
        if (kind < 0.5) {
          // jar of sweets
          const jar = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8 + seedRand() * 4, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.7, 0.6), roughness: 0.2, transparent: true, opacity: 0.85 }));
          jar.position.set(x, y + 0.8 + (jar.geometry as THREE.CylinderGeometry).parameters.height / 2, -118);
          const lid = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.2, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.7 }));
          lid.position.y = (jar.geometry as THREE.CylinderGeometry).parameters.height / 2 + 0.6;
          jar.add(lid);
          this.scene.add(jar);
        } else {
          // cake with icing and a cherry
          const cake = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 5, 20), new THREE.MeshStandardMaterial({ color: 0xf3c988, roughness: 0.8 }));
          cake.position.set(x, y + 0.8 + 2.5, -118);
          const icing = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.1, 1.4, 20), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.8, 0.75), roughness: 0.5 }));
          icing.position.y = 2.9;
          const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff3b5c, roughness: 0.3 }));
          cherry.position.y = 4.2;
          cake.add(icing, cherry);
          this.scene.add(cake);
        }
      }
    }
    // A giant cookie moon.
    const moon = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 3, 40), new THREE.MeshStandardMaterial({ color: 0xf2b24a, emissive: 0xf2b24a, emissiveIntensity: 0.35, roughness: 0.8 }));
    moon.rotation.x = Math.PI / 2;
    moon.position.set(90, 95, -125);
    for (let i = 0; i < 9; i++) {
      const chip = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), chipMat);
      const a = i * 2.4; const r = 3 + (i % 4) * 3;
      chip.position.set(Math.cos(a) * r, Math.sin(a) * r, 1.6);
      moon.add(chip);
    }
    this.scene.add(moon);
  }

  /** Cakes on the front shelf, one per level the player has completed. */
  setLandmarks(n: number): void {
    this.landmarks.clear();
    if (n > 0) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(160, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0xa8683c, roughness: 0.8 }));
      shelf.position.set(-7, 14, -60);
      this.landmarks.add(shelf);
    }
    for (let i = 0; i < n; i++) {
      const place = (i % 4) as Place;
      const x = -75 + ((i * 29) % 140);
      const color = new THREE.Color(COLORS[place]);
      const cake = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 5, 20), new THREE.MeshStandardMaterial({ color: 0xf3c988, roughness: 0.8 }));
      cake.position.set(x, 14.6 + 2.5, -60);
      const icing = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.1, 1.5, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 }));
      icing.position.y = 2.9;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      candle.position.y = 4.6;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffb347, emissiveIntensity: 2.5 }));
      flame.position.y = 6.2;
      cake.add(icing, candle, flame);
      this.landmarks.add(cake);
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
    this.blockRoot.position.set(0, 0, 0);
    this.blockRoot.rotation.set(0, 0, 0);
    this.clearFinale();
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
      b.userData.mat.emissiveIntensity = BASE_GLOW + (1 - k) * 0.9;
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
    await this.tween(0.22, (k) => { for (const b of ten) b.userData.mat.emissiveIntensity = BASE_GLOW + k * 1.6; });
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
      big.userData.mat.emissiveIntensity = 2 - k * (2 - BASE_GLOW);
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
      b.userData.mat.emissiveIntensity = BASE_GLOW + k * 1.4;
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
        p.userData.mat.emissiveIntensity = 1.4 - e * (1.4 - BASE_GLOW);
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
      for (const b of all) b.userData.mat.emissiveIntensity = BASE_GLOW + glow * 1.5;
    }, (x) => x);
  }

  /** A damp little puff: the bang didn't work. */
  async fizzle(): Promise<void> {
    for (const p of [0, 1, 2, 3] as Place[]) {
      const n = this.blocks[p].length;
      if (n) this.burst(slotPos(p, n - 1).add(new THREE.Vector3(0, DIMS[p][1], 0)), 0x8a8fa8, 30, 5);
    }
    const all = this.blocks.flat();
    const base = all.map((b) => b.position.x);
    await this.tween(0.45, (k) => {
      const dx = Math.sin(k * Math.PI * 7) * (1 - k) * 0.6;
      all.forEach((b, i) => { b.position.x = base[i] + dx; });
    }, (x) => x);
    all.forEach((b, i) => { b.position.x = base[i]; });
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

  // ---- level finale: the tower charges the Grumble Wall ---------------------

  private clearFinale(): void {
    if (this.wall) { this.scene.remove(this.wall.group); this.wall = null; }
    for (const d of this.debris) this.scene.remove(d.obj);
    this.debris = [];
    this.finaleShift = 0;
  }

  private buildWall(): NonNullable<typeof this.wall> {
    const group = new THREE.Group();
    const W = WALL_COLS * BRICK; const H = WALL_ROWS * BRICK; const D = 10;
    const mat = new THREE.MeshStandardMaterial({ color: 0x8dff6a, emissive: 0x2bd94a, emissiveIntensity: 0.35, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.62 });
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, H / 2, D), mat);
    bottom.position.set(this.fitCenter, H / 4, WALL_Z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, H / 2, D * 0.94), mat);
    top.position.set(this.fitCenter, (H * 3) / 4, WALL_Z);
    group.add(bottom, top);
    // A face. Eyes widen when the tower charges; pupils rattle when it hits.
    const eyes = new THREE.Group();
    const pupils: THREE.Mesh[] = [];
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff7d0, emissiveIntensity: 0.9 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 1 });
    for (const dx of [-5, 5]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14), eyeMat);
      eye.position.set(this.fitCenter + dx, BRICK * 4.6, WALL_Z + D / 2 + 0.6);
      eye.scale.set(1, 0.85, 0.6);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), pupilMat);
      pupil.position.set(0, 0, 1.4);
      eye.add(pupil);
      eyes.add(eye);
      pupils.push(pupil);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(3, 0.5, 8, 24, Math.PI), pupilMat);
    mouth.position.set(this.fitCenter, BRICK * 2.6, WALL_Z + D / 2 + 0.4);
    mouth.rotation.z = Math.PI;
    group.add(eyes, mouth);
    this.scene.add(group);
    return { group, top, bottom, eyes, pupils, mat };
  }

  private toDebris(obj: THREE.Object3D, vel: THREE.Vector3): void {
    // Re-parent into world space so it keeps flying wherever its group goes.
    const world = new THREE.Vector3();
    obj.getWorldPosition(world);
    obj.parent?.remove(obj);
    obj.position.copy(world);
    this.scene.add(obj);
    this.debris.push({ obj, vel, ang: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), life: 0 });
  }

  /**
   * Power 3: straight through. Power 2: cracks the top half. Power 1: bonk and bounce back.
   * onImpact fires the moment the tower meets the wall so the game can play the right sound.
   */
  async finale(power: 1 | 2 | 3, onImpact: () => void): Promise<void> {
    this.clearFinale();
    const jelly = this.buildWall();
    this.wall = jelly;
    const wallH = WALL_ROWS * BRICK;
    this.finaleShift = -14;
    this.fitHeight = Math.max(this.fitHeight, 34);
    const wobble = (k: number, amt: number) => {
      const w = Math.sin(k * Math.PI * 6) * amt;
      jelly.group.scale.set(1 + w, 1 - w, 1 + w * 0.5);
    };

    // The jelly rises out of the counter, wobbling.
    jelly.group.position.y = -wallH - 1;
    await this.tween(1.0, (k) => { jelly.group.position.y = (-wallH - 1) * (1 - k); wobble(k, 0.05 * (1 - k)); }, easeOutCubic);

    // The tower lifts, leans back, and winds up.
    const root = this.blockRoot;
    await this.tween(0.9, (k) => {
      root.position.set(0, 9 * k, 16 * k);
      root.rotation.x = -0.22 * k;
      for (const eye of jelly.eyes.children) eye.scale.set(1 + 0.3 * k, 0.85 + 0.35 * k, 0.6);
    }, easeInOut);
    await this.tween(0.35, () => {});

    // Charge!
    const contactZ = WALL_Z + 5 + 6;
    await this.tween(0.45, (k) => { root.position.z = 16 + (contactZ - 16) * k; root.position.y = 9 - 3 * k; }, easeInCubic);
    onImpact();

    if (power === 3) {
      // SPLAT: the jelly bursts into wobbly cubes.
      jelly.group.remove(jelly.top, jelly.bottom);
      const W = WALL_COLS * BRICK;
      for (let i = 0; i < 70; i++) {
        const size = 1.5 + Math.random() * 2.5;
        const cube = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), jelly.mat);
        cube.position.set(this.fitCenter + (Math.random() - 0.5) * W, Math.random() * wallH, WALL_Z + (Math.random() - 0.5) * 8);
        jelly.group.add(cube);
        this.toDebris(cube, new THREE.Vector3((Math.random() - 0.5) * 28, 8 + Math.random() * 24, -12 - Math.random() * 28));
      }
      this.toDebris(jelly.eyes, new THREE.Vector3(0, 26, -18));
      for (let i = 0; i < 4; i++) this.burst(new THREE.Vector3(this.fitCenter + (i - 1.5) * 9, 8 + i * 3, WALL_Z), [0x8dff6a, 0xff5c7a, 0xfff3b0, 0x4fb3ff][i], 140, 26);
      await this.tween(1.1, (k) => { root.position.z = contactZ + (-52 - contactZ) * k; root.position.y = 6 + Math.sin(k * Math.PI) * 4; root.rotation.x = -0.22 + 0.1 * k; }, easeOutCubic);
    } else if (power === 2) {
      // SPLIT: the top half slides off and flops away; the bottom half wobbles.
      this.toDebris(jelly.top, new THREE.Vector3((Math.random() - 0.5) * 6, 14, -16));
      this.toDebris(jelly.eyes, new THREE.Vector3((Math.random() - 0.5) * 6, 20, -12));
      this.burst(new THREE.Vector3(this.fitCenter, 14, WALL_Z), 0x8dff6a, 160, 22);
      await this.tween(1.1, (k) => {
        root.position.z = contactZ - 4 * k;
        root.rotation.z = Math.sin(k * Math.PI * 4) * 0.12 * (1 - k);
        root.position.y = 6;
        wobble(k, 0.12 * (1 - k));
      }, easeOutCubic);
    } else {
      // BOING: the jelly squashes, springs back, and bounces the tower away.
      this.burst(new THREE.Vector3(this.fitCenter, 8, contactZ - 4), 0x8dff6a, 60, 10);
      await this.tween(1.3, (k) => {
        root.position.z = contactZ + (14 - contactZ) * k;
        root.position.y = 6 + Math.sin(k * Math.PI) * 10;
        root.rotation.x = -0.22 + Math.sin(k * Math.PI) * 0.9;
        const squash = Math.max(0, Math.sin(Math.min(1, k * 3) * Math.PI)) * 0.35;
        jelly.group.scale.set(1 + squash, 1 - squash, 1 + squash * 0.5);
        if (k > 0.34) wobble(k, 0.1 * (1 - k));
        for (const pu of jelly.pupils) pu.position.x = Math.sin(k * 25) * 0.6 * (1 - k);
      }, easeOutCubic);
      jelly.group.scale.set(1, 1, 1);
      await this.tween(0.6, (k) => { root.position.y = 6 * (1 - k); root.position.z = 14 * (1 - k); root.rotation.x = -0.22 * (1 - k); }, easeOutBack);
    }
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

    // Debris from the finale.
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.vel.y -= 34 * dt;
      d.obj.rotation.x += d.ang.x * dt;
      d.obj.rotation.y += d.ang.y * dt;
      d.obj.rotation.z += d.ang.z * dt;
      if (d.obj.position.y < 1.4 && d.vel.y < 0) {
        d.obj.position.y = 1.4;
        d.vel.y *= -0.35;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
        d.ang.multiplyScalar(0.5);
      }
      if (d.life > 6) { this.scene.remove(d.obj); this.debris.splice(i, 1); }
    }

    // Camera framing: fit the plots' width and the tallest column.
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const width = this.fitWidth;
    const height = this.fitHeight + 6 + (this.finaleShift ? 10 : 0);
    const dist = Math.max((width / 2) / Math.tan(hfov / 2), (height / 2) / Math.tan(vfov / 2)) * (this.camera.aspect < 1 ? 1.25 : 1.05) + 9;
    const yaw = THREE.MathUtils.degToRad(22);
    const pitch = THREE.MathUtils.degToRad(17);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.camTarget.set(this.fitCenter, Math.max(5, this.fitHeight * 0.36), this.finaleShift);
    this.camPos.copy(this.camTarget).addScaledVector(dir, dist);
    this.camera.position.lerp(this.camPos, 1 - Math.pow(0.02, dt));
    this.lookAt.lerp(this.camTarget, 1 - Math.pow(0.02, dt));
    this.camera.lookAt(this.lookAt);

    // Idle shimmer on blocks.
    const shimmer = BASE_GLOW + Math.sin(this.elapsed * 2.2) * 0.04;
    if (this.tweens.length === 0) for (const b of this.blocks.flat()) b.userData.mat.emissiveIntensity = shimmer;
    this.starField.position.y = Math.sin(this.elapsed * 0.3) * 1.5;
    for (const l of this.halfLines) if (l.visible) (l.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.elapsed * 4) * 0.3;

    this.composer.render(dt);
  }
}
