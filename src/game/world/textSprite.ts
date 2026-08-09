import * as THREE from 'three';

/** Canvas-backed text sprites for door labels, pads, bins, and tiles. */

function drawLabel(canvas: HTMLCanvasElement, text: string, color = '#FFF3D6'): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lines = text.split('\n');
  const base = canvas.width / (lines.some((l) => l.length > 10) ? 11 : 8);
  ctx.font = `bold ${base}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const y = canvas.height / 2 + (i - (lines.length - 1) / 2) * base * 1.25;
    ctx.strokeStyle = 'rgba(20,16,30,0.9)';
    ctx.lineWidth = base / 5;
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(line, canvas.width / 2, y);
  });
}

export function makeTextSprite(text: string, size = 380, color?: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size / 2;
  drawLabel(canvas, text, color);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(size / 64, size / 128, 1);
  (sprite.userData as { canvas: HTMLCanvasElement; color?: string }).canvas = canvas;
  (sprite.userData as { color?: string }).color = color;
  return sprite;
}

export function updateTextSprite(sprite: THREE.Sprite, text: string, color?: string): void {
  const ud = sprite.userData as { canvas?: HTMLCanvasElement; color?: string };
  if (!ud.canvas) return;
  drawLabel(ud.canvas, text, color ?? ud.color);
  (sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
}
