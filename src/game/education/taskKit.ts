import * as THREE from 'three';
import { toonMat } from '../../engine/renderer';
import { makeTextSprite, updateTextSprite } from '../world/textSprite';
import type { AudioEngine } from '../../engine/audio';
import type { ParticleSystem } from '../actors/particles';
import type { Player, CarryTarget } from '../player/player';
import type { Interactable, InteractableManager } from '../world/interactables';

/**
 * Shared toolbox for task modules: pads, labels, carryable items, colliders.
 * Everything a task spawns lives in kit.group and is torn down on dispose.
 */

export interface TaskCollider { center: THREE.Vector3; half: THREE.Vector3; id: string }

export interface Pad {
  root: THREE.Group;
  top: THREE.Mesh;
  label: THREE.Sprite;
  pos: THREE.Vector3;
  radius: number;
  setLabel(text: string, color?: string): void;
  setColor(hex: string): void;
  pulse(): void;
}

export class TaskKit {
  readonly group = new THREE.Group();
  readonly colliders: TaskCollider[] = [];
  private interactableIds: string[] = [];
  private carryables: { target: CarryTarget; free: () => boolean }[] = [];
  private pulses: { mesh: THREE.Object3D; t: number }[] = [];

  constructor(
    parent: THREE.Object3D,
    readonly particles: ParticleSystem,
    readonly audio: AudioEngine,
    readonly player: Player,
    private interactables: InteractableManager,
  ) {
    parent.add(this.group);
  }

  makePad(pos: THREE.Vector3, text: string, color = '#8898B8'): Pad {
    const root = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.22, 14), toonMat('#5A5A68'));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.14, 14), toonMat(color));
    top.position.y = 0.18;
    const label = makeTextSprite(text, 300);
    label.position.y = 1.7;
    root.add(base, top, label);
    root.position.copy(pos);
    root.traverse((o) => { o.castShadow = true; });
    this.group.add(root);
    const pad: Pad = {
      root, top, label, pos: pos.clone(), radius: 1.15,
      setLabel: (t, c) => updateTextSprite(label, t, c),
      setColor: (hex) => { top.material = toonMat(hex); },
      pulse: () => this.pulses.push({ mesh: root, t: 0 }),
    };
    return pad;
  }

  /** Is the player standing on (or right at) this pad? */
  padTriggered(pad: Pad): boolean {
    const p = this.player.pos;
    const dx = p.x - pad.pos.x, dz = p.z - pad.pos.z;
    return dx * dx + dz * dz < pad.radius * pad.radius
      && Math.abs(p.y - pad.pos.y) < 1.0 && this.player.grounded;
  }

  makeFloatingLabel(pos: THREE.Vector3, text: string, size = 300, color?: string): THREE.Sprite {
    const s = makeTextSprite(text, size, color);
    s.position.copy(pos);
    this.group.add(s);
    return s;
  }

  /** Chompable item with a floating label. Shape: box | ball | gem | bone. */
  makeItem(pos: THREE.Vector3, label: string, shape: string, color: string): { root: THREE.Group; target: CarryTarget; home: THREE.Vector3; carried(): boolean } {
    const root = new THREE.Group();
    let mesh: THREE.Mesh;
    switch (shape) {
      case 'ball': mesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), toonMat(color)); break;
      case 'gem': mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), toonMat(color, { emissive: color })); break;
      case 'bone': {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.72, 8), toonMat('#EDE3CE'));
        mesh.rotation.z = Math.PI / 2;
        const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toonMat('#EDE3CE'));
        k1.position.x = 0.38;
        const k2 = k1.clone(); k2.position.x = -0.38;
        mesh.add(k1, k2);
        break;
      }
      default: mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), toonMat(color)); break;
    }
    mesh.position.y = 0.4;
    mesh.castShadow = true;
    const sprite = makeTextSprite(label, 260);
    sprite.position.y = 1.25;
    root.add(mesh, sprite);
    root.position.copy(pos);
    this.group.add(root);
    let free = true;
    const entry = {
      root,
      home: pos.clone(),
      target: {
        root, kind: 'item' as const, id: label,
        onPicked: () => { free = false; },
      },
      carried: () => !free,
    };
    this.carryables.push({ target: entry.target, free: () => free });
    // returning item to the world makes it grabbable again
    const origDetach = (): void => { free = true; };
    (root.userData as { onReturned?: () => void }).onReturned = origDetach;
    return entry;
  }

  /** Called by the scene's grab hook. */
  getGrabTarget(pos: THREE.Vector3, fwd: THREE.Vector3, range: number): CarryTarget | null {
    let best: CarryTarget | null = null;
    let bestD = range + 0.6;
    const probe = pos.clone().addScaledVector(fwd, range * 0.6);
    for (const c of this.carryables) {
      if (!c.free()) continue;
      const world = c.target.root.getWorldPosition(new THREE.Vector3());
      const d = world.distanceTo(probe);
      if (d < bestD) { bestD = d; best = c.target; }
    }
    return best;
  }

  markItemReturned(root: THREE.Object3D): void {
    (root.userData as { onReturned?: () => void }).onReturned?.();
  }

  addInteractable(item: Interactable): void {
    this.interactables.add(item);
    this.interactableIds.push(item.id);
  }

  addCollider(center: THREE.Vector3, half: THREE.Vector3, id: string): TaskCollider {
    const c = { center: center.clone(), half: half.clone(), id };
    this.colliders.push(c);
    return c;
  }
  removeCollider(id: string): void {
    const i = this.colliders.findIndex((c) => c.id === id);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  update(dt: number): void {
    for (const p of [...this.pulses]) {
      p.t += dt * 5;
      const s = 1 + Math.sin(Math.min(Math.PI, p.t)) * 0.14;
      p.mesh.scale.setScalar(s);
      if (p.t >= Math.PI) { p.mesh.scale.setScalar(1); this.pulses.splice(this.pulses.indexOf(p), 1); }
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const id of this.interactableIds) this.interactables.remove(id);
    this.colliders.length = 0;
    this.carryables.length = 0;
  }
}
