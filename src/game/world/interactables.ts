import * as THREE from 'three';
import type { Hud } from '../ui/hud';
import type { Input } from '../../engine/input';

/**
 * Proximity interactions: doors, portals, signs, banks, task pedestals, NPCs.
 * Shows one prompt for the nearest available interactable; dispatches the
 * interact press. Everything in the world the player can "talk to" goes here.
 */
export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  /** Prompt verb, e.g. strings 'prompt.talk'. */
  label: string;
  enabled?: () => boolean;
  onInteract: () => void;
}

export class InteractableManager {
  private items: Interactable[] = [];
  private nearest: Interactable | null = null;

  constructor(private hud: Hud, private input: Input) {}

  add(item: Interactable): Interactable {
    this.items.push(item);
    return item;
  }

  remove(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
  }

  clear(): void { this.items = []; this.hud.hidePrompt(); }

  update(playerPos: THREE.Vector3, uiBlocked: boolean): void {
    if (uiBlocked) { this.hud.hidePrompt(); this.nearest = null; return; }
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      const d = it.pos.distanceToSquared(playerPos);
      if (d < it.radius * it.radius && d < bestD) { bestD = d; best = it; }
    }
    this.nearest = best;
    if (best) this.hud.showPrompt('E', best.label);
    else this.hud.hidePrompt();

    if (best && this.input.pressed('interact')) {
      best.onInteract();
    }
  }

  get current(): Interactable | null { return this.nearest; }
}
