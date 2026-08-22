import { clamp } from '../game/math';

export const PALETTE = {
  bg: '#14110d',
  panel: '#1c1813',
  ink: '#efe7da',
  accent: '#c4614e',
  guestBody: '#79828f',
  guestHead: '#a1907e',
  childBody: '#949dab',
  brideBody: '#f2efe8',
  groomBody: '#2b3038',
  officiantBody: '#4c5160',
  speakerBody: '#3f4a5e',
  hair: '#3a332c',
  wood: '#8a6f52',
  cloth: '#d8cdb8',
  glass: '#ffe9bd',
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export function rgbStr(r: number, g: number, b: number, a = 1): string {
  return a >= 1 ? `#${toHex(r)}${toHex(g)}${toHex(b)}` : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

/** Multiply brightness and pull the colour towards a tint. */
export function shade(hex: string, mul: number, tintHex?: string, tintAmt = 0): string {
  const [r, g, b] = hexToRgb(hex);
  let out: [number, number, number] = [r * mul, g * mul, b * mul];
  if (tintHex && tintAmt > 0) {
    const [tr, tg, tb] = hexToRgb(tintHex);
    out = [out[0] + (tr - out[0]) * tintAmt, out[1] + (tg - out[1]) * tintAmt, out[2] + (tb - out[2]) * tintAmt];
  }
  return rgbStr(out[0], out[1], out[2]);
}

export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
