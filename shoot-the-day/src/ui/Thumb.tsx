import { useEffect, useRef } from 'react';
import { renderFrame } from '../render/viewfinder';
import { frameRect } from '../render/projection';
import type { SceneDef, Shot } from '../game/types';

/**
 * A contact-sheet thumbnail. Nothing is stored as an image: the frame is
 * re-rendered from the camera state and body positions the shot recorded.
 */
export function Thumb({ shot, scene, width }: { shot: Shot; scene: SceneDef; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round(width / (2 / 3));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    renderFrame(ctx, {
      scene,
      cam: shot.cam,
      guests: shot.guests,
      particles: shot.particles,
      frame: frameRect(0, 0, width, height),
      time: shot.t,
      exposure: 1,
      detail: true,
    });
  }, [shot, scene, width, height]);

  return <canvas ref={ref} style={{ width, height }} className="block rounded-[2px]" />;
}
