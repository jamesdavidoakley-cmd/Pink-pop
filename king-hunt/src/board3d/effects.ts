import * as THREE from 'three';
import type { AttackReport } from '../chess/attack-lens';
import type { Square } from '../chess/types';
import { squareToWorld } from './coords';
import { PALETTE } from './palette';
import type { BoardScene } from './scene';

/**
 * Visual layer for the Attack Lens:
 *  - heat map: tiles glow warm where we press, cool where they press on our king
 *  - fire lines: glowing beams from our attackers to the enemy king zone
 *  - king danger ring: pulses under the enemy king as pressure builds
 */
export class AttackEffects {
  private heat = new Map<Square, { warm: number; cool: number }>();
  private highlight = new Map<Square, THREE.Color>();
  private fireLines: THREE.Mesh[] = [];
  private lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.fireLine, transparent: true, opacity: 0.75 });
  private ring: THREE.Mesh;
  private ringTarget = 0;
  private ringLevel = 0;
  private hot = new THREE.Color(PALETTE.heatHot);
  private cold = new THREE.Color(PALETTE.heatCold);
  private tmp = new THREE.Color();

  constructor(private board: BoardScene) {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.48, 32),
      new THREE.MeshBasicMaterial({ color: PALETTE.kingDanger, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    board.fxGroup.add(this.ring);
    board.onTick((dt, t) => this.tick(dt, t));
  }

  /** `ours` = our pressure report, `theirs` = their pressure report. */
  setReports(ours: AttackReport, theirs: AttackReport, allOurAttackers: Map<Square, number>) {
    this.heat.clear();
    for (const [s, n] of allOurAttackers) this.heat.set(s, { warm: Math.min(1, n / 3) * 0.35, cool: 0 });
    for (const z of ours.zonePressure) {
      const h = this.heat.get(z.square) ?? { warm: 0, cool: 0 };
      h.warm = Math.min(1, z.attackers.length / 2.5);
      this.heat.set(z.square, h);
    }
    for (const z of theirs.zonePressure) {
      if (z.attackers.length === 0) continue;
      const h = this.heat.get(z.square) ?? { warm: 0, cool: 0 };
      h.cool = Math.min(1, z.attackers.length / 2.5) * 0.7;
      this.heat.set(z.square, h);
    }
    this.rebuildFireLines(ours);
    this.ring.position.copy(squareToWorld(ours.enemyKing, 0.012));
    this.ringTarget = Math.min(1, ours.kingZoneAttackers / 5) + (ours.mateInOne ? 0.5 : 0);
    this.applyTiles();
  }

  setHighlights(map: Map<Square, THREE.Color>) {
    this.highlight = map;
    this.board.labels.highlight([...map.keys()]);
    this.applyTiles();
  }

  private applyTiles() {
    for (const tile of this.board.tiles.values()) {
      const h = this.heat.get(tile.square);
      const hl = this.highlight.get(tile.square);
      const mat = tile.mesh.material;
      if (hl) {
        mat.emissive.copy(hl);
        mat.emissiveIntensity = 0.9;
        mat.color.copy(tile.base).lerp(hl, 0.35);
        continue;
      }
      mat.color.copy(tile.base);
      if (!h || (h.warm === 0 && h.cool === 0)) {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        continue;
      }
      this.tmp.setHex(0x000000);
      this.tmp.lerp(this.hot, h.warm);
      if (h.cool > 0) this.tmp.lerp(this.cold, h.cool * 0.6);
      mat.emissive.copy(this.tmp);
      mat.emissiveIntensity = 0.55 + 0.45 * Math.max(h.warm, h.cool);
    }
  }

  private rebuildFireLines(ours: AttackReport) {
    for (const m of this.fireLines) this.board.fxGroup.remove(m);
    this.fireLines = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const line of ours.fireLines) {
      const a = squareToWorld(line.from, 0.55);
      const b = squareToWorld(line.to, 0.08);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const geo = new THREE.CylinderGeometry(0.025, 0.012, len, 6, 1, true);
      const mesh = new THREE.Mesh(geo, this.lineMat);
      mesh.position.copy(a).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(up, dir.normalize());
      this.board.fxGroup.add(mesh);
      this.fireLines.push(mesh);
    }
  }

  private tick(dt: number, t: number) {
    this.ringLevel += (this.ringTarget - this.ringLevel) * Math.min(1, dt * 6);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const mat = this.ring.material as THREE.MeshBasicMaterial;
    mat.opacity = this.ringLevel * (0.45 + 0.4 * pulse);
    const s = 1 + 0.12 * pulse * this.ringLevel;
    this.ring.scale.set(s, s, 1);
    this.lineMat.opacity = 0.55 + 0.3 * Math.sin(t * 3);
  }
}
