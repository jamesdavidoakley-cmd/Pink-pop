import * as THREE from 'three';
import { fileOf, rankOf, type Square } from '../chess/types';
import { TILE } from './coords';

/**
 * Coordinates around the board: a–h along both long edges, 1–8 along both
 * sides. Camera-facing sprites, so they read correctly whichever colour is at
 * the bottom. The labels of a highlighted square light up.
 */
export class BoardLabels {
  private sprites: { s: THREE.Sprite; kind: 'file' | 'rank'; index: number; base: THREE.Color; hot: THREE.Color }[] = [];
  private cache = new Map<string, THREE.Texture>();

  constructor(parent: THREE.Object3D) {
    const edge = 4 * TILE + 0.36;
    for (let i = 0; i < 8; i++) {
      const letter = 'abcdefgh'[i]!;
      const x = (i - 3.5) * TILE;
      const z = (3.5 - i) * TILE;
      for (const side of [1, -1]) {
        this.add(parent, letter, 'file', i, new THREE.Vector3(x, 0.02, edge * side));
        this.add(parent, String(i + 1), 'rank', i, new THREE.Vector3(edge * side, 0.02, z));
      }
    }
  }

  private add(parent: THREE.Object3D, text: string, kind: 'file' | 'rank', index: number, pos: THREE.Vector3) {
    const base = new THREE.Color(0xc9bfa8);
    const hot = new THREE.Color(0xffb02e);
    const mat = new THREE.SpriteMaterial({ map: this.texture(text), color: base, transparent: true, opacity: 0.85, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(0.4, 0.4, 1);
    s.renderOrder = 2;
    parent.add(s);
    this.sprites.push({ s, kind, index, base, hot });
  }

  private texture(text: string): THREE.Texture {
    let t = this.cache.get(text);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    g.font = '900 92px Nunito, "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.8)';
    g.shadowBlur = 10;
    g.fillStyle = '#fff';
    g.fillText(text, 64, 70);
    t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    this.cache.set(text, t);
    return t;
  }

  /** Brighten the file and rank labels of these squares; empty list resets. */
  highlight(squares: Square[]) {
    const files = new Set(squares.map(fileOf));
    const ranks = new Set(squares.map(rankOf));
    for (const sp of this.sprites) {
      const on = sp.kind === 'file' ? files.has(sp.index) : ranks.has(sp.index);
      const m = sp.s.material;
      m.color.copy(on ? sp.hot : sp.base);
      m.opacity = on ? 1 : 0.85;
      sp.s.scale.setScalar(on ? 0.52 : 0.4);
    }
  }
}
