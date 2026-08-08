import * as THREE from 'three';
import {
  BloomEffect, EffectComposer, EffectPass, OutlineEffect,
  RenderPass, SMAAEffect, VignetteEffect,
} from 'postprocessing';

export type Quality = 'low' | 'medium' | 'high';

export interface PaletteDef {
  skyTop: string; skyBottom: string; fog: string; fogNear?: number; fogFar?: number;
  sun: string; sunIntensity?: number; ambient: string; ambientIntensity?: number;
}

/**
 * Scene, lights, gradient sky dome, post FX chain (SMAA → bloom → vignette +
 * outline on characters/interactables) and quality presets (§2.4).
 */
export class RendererSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private outline: OutlineEffect;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  quality: Quality = 'medium';
  private trauma = 0;
  reduceShake = false;
  reduceFlash = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 400);
    this.camera.position.set(0, 3, 8);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6a5a48, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    this.sun.position.set(18, 30, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -45; this.sun.shadow.camera.right = 45;
    this.sun.shadow.camera.top = 45; this.sun.shadow.camera.bottom = -45;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Gradient sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#5aa7e8') },
        bottom: { value: new THREE.Color('#ffdba8') },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.05, 0.65, h)), 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Post chain
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlineEffect(this.scene, this.camera, {
      edgeStrength: 2.2, visibleEdgeColor: 0x1c1c2e, hiddenEdgeColor: 0x1c1c2e,
      blur: false, xRay: false,
    });
    this.rebuildPasses();

    window.addEventListener('resize', () => this.resize(container));
  }

  private bloomPass: EffectPass | null = null;
  private fxPass: EffectPass | null = null;

  private rebuildPasses(): void {
    this.composer.removeAllPasses();
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      this.bloomPass = new EffectPass(this.camera,
        new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.72, luminanceSmoothing: 0.2, mipmapBlur: true }),
        this.outline,
        new SMAAEffect(), new VignetteEffect({ darkness: 0.42, offset: 0.28 }));
      this.composer.addPass(this.bloomPass);
    } else if (this.quality === 'medium') {
      this.fxPass = new EffectPass(this.camera, this.outline, new SMAAEffect(), new VignetteEffect({ darkness: 0.38, offset: 0.3 }));
      this.composer.addPass(this.fxPass);
    }
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.rebuildPasses();
  }

  /** Character/interactable outline selection. */
  addOutline(obj: THREE.Object3D): void {
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.outline.selection.add(o as THREE.Mesh); });
  }
  removeOutline(obj: THREE.Object3D): void {
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.outline.selection.delete(o as THREE.Mesh); });
  }
  clearOutlines(): void { this.outline.selection.clear(); }

  applyPalette(p: PaletteDef): void {
    (this.skyMat.uniforms.top.value as THREE.Color).set(p.skyTop);
    (this.skyMat.uniforms.bottom.value as THREE.Color).set(p.skyBottom);
    this.scene.fog = new THREE.Fog(new THREE.Color(p.fog), p.fogNear ?? 40, p.fogFar ?? 160);
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity ?? 1.6;
    this.hemi.color.set(p.ambient);
    this.hemi.intensity = p.ambientIntensity ?? 0.9;
    this.hemi.groundColor.set(new THREE.Color(p.fog).multiplyScalar(0.7));
  }

  shake(amount: number): void {
    if (this.reduceShake) amount *= 0.3;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Keep the shadow camera centred on the action. */
  focusShadows(target: THREE.Vector3): void {
    this.sun.position.set(target.x + 18, target.y + 30, target.z + 12);
    this.sun.target.position.copy(target);
  }

  render(dt: number): void {
    if (this.trauma > 0.001) {
      const t = this.trauma * this.trauma;
      this.camera.position.x += (Math.random() - 0.5) * 0.35 * t;
      this.camera.position.y += (Math.random() - 0.5) * 0.3 * t;
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }
    this.sky.position.copy(this.camera.position);
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }

  resize(container: HTMLElement): void {
    const w = container.clientWidth, h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
}

/** Shared toon material factory — 3-step gradient ramp, per-world palettes. */
let toonRamp: THREE.DataTexture | null = null;
export function gradientRamp(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonRamp.needsUpdate = true;
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  return toonRamp;
}

const matCache = new Map<string, THREE.MeshToonMaterial>();
export function toonMat(color: string, opts?: { emissive?: string; flat?: boolean }): THREE.MeshToonMaterial {
  const key = `${color}|${opts?.emissive ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientRamp() });
    if (opts?.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 0.8; }
    matCache.set(key, m);
  }
  return m;
}

/** One shared vertex-coloured toon material for merged static level geometry. */
export function vertexToonMat(): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientRamp() });
  return m;
}
