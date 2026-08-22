import { clamp } from '../game/math';
import type { SceneDef } from '../game/types';

/**
 * How much light is falling on a point, 0..1. Windows throw a beam down
 * `lightDir`; a practical lamp falls off with distance.
 */
export function litness(scene: SceneDef, x: number, y: number): number {
  if (scene.lightPoint) {
    const d = Math.hypot(x - scene.lightPoint.x, y - scene.lightPoint.y);
    return clamp(2.6 / (1.2 + d * 0.85));
  }
  const d = scene.lightDir;
  if (!d) return 0.5;
  let best = 0;
  for (const w of scene.windows) {
    const cx = (w.a.x + w.b.x) / 2;
    const cy = (w.a.y + w.b.y) / 2;
    const half = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) / 2;
    const px = x - cx;
    const py = y - cy;
    const along = px * d.x + py * d.y;
    const lateral = Math.abs(px * -d.y + py * d.x);
    if (along < -0.5) continue;
    const reach = clamp(1 - along / 11);
    const spread = clamp(1 - Math.max(0, lateral - half) / 3.2);
    best = Math.max(best, w.strength * reach * spread);
  }
  return clamp(best);
}

/** Brightness multiplier for a body standing at this point. */
export function brightnessAt(scene: SceneDef, x: number, y: number): number {
  return clamp(scene.ambient * (0.55 + 0.75 * litness(scene, x, y)), 0.18, 1.35);
}

/** Rim light strength: how much the subject is lit from behind the camera's view. */
export function rimAt(scene: SceneDef, x: number, y: number, heading: number): number {
  const l = litness(scene, x, y);
  const d = scene.lightPoint
    ? (() => {
        const dx = x - scene.lightPoint.x;
        const dy = y - scene.lightPoint.y;
        const m = Math.hypot(dx, dy) || 1;
        return { x: dx / m, y: dy / m };
      })()
    : scene.lightDir!;
  const dot = Math.cos(heading) * d.x + Math.sin(heading) * d.y;
  return clamp(l * -dot);
}
