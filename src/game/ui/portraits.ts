import * as THREE from 'three';
import { buildRig } from '../actors/rigs';
import type { CharacterDef } from '../../engine/types';

/**
 * Renders each character's actual 3D head to a small offscreen canvas once,
 * for subtitle portraits. Cached per character id.
 */
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;

export function portraitFor(id: string, def: CharacterDef): string {
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(128, 128);
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x808098, 1.5));
    const key = new THREE.DirectionalLight(0xfff2d8, 1.8);
    key.position.set(1, 2, 2);
    scene.add(key);
    const rig = buildRig(def);
    rig.update({ mode: 'idle', speed01: 0 }, 0.3, 0.016);
    rig.setExpression('happy');
    scene.add(rig.root);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
    const headY = rig.height * (def.rig === 'dog' ? 0.72 : 0.86);
    cam.position.set(0.16, headY + 0.18, rig.height * 0.85);
    cam.lookAt(0, headY, 0);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    cache.set(id, url);
    return url;
  } catch {
    // headless/no-GL fallback: flat colour swatch
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = def.colors.body;
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.name[0] ?? '?', 32, 34);
    }
    const url = c.toDataURL('image/png');
    cache.set(id, url);
    return url;
  }
}
