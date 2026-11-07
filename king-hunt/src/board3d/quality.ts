/**
 * Graphics presets. Phones get fewer particles, smaller shadows and a lower
 * pixel ratio; the look stays the same. Auto-detected, overridable in settings.
 */
export type QualityLevel = 'auto' | 'high' | 'low';

export interface QualityPreset {
  pixelRatio: number;
  shadowMap: number;
  bloom: number;
  dust: number;
  clouds: number;
  torchLights: number; // how many of the four torches carry a real point light
  smaa: boolean;
}

export const PRESETS: Record<'high' | 'low', QualityPreset> = {
  high: { pixelRatio: 2, shadowMap: 2048, bloom: 1.15, dust: 160, clouds: 14, torchLights: 4, smaa: true },
  low: { pixelRatio: 1.25, shadowMap: 1024, bloom: 0.9, dust: 50, clouds: 8, torchLights: 2, smaa: false },
};

export function detectLow(): boolean {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  return mobile || cores <= 4 || mem <= 4;
}

export function resolveQuality(level: QualityLevel): QualityPreset {
  if (level === 'high') return PRESETS.high;
  if (level === 'low') return PRESETS.low;
  return detectLow() ? PRESETS.low : PRESETS.high;
}

/** Read the override before the scene is built (settings live in localStorage). */
export function qualityFromStorage(): QualityLevel {
  try {
    const raw = localStorage.getItem('king-hunt.progress.v1');
    const q = raw ? (JSON.parse(raw).settings?.quality as QualityLevel | undefined) : undefined;
    return q === 'high' || q === 'low' ? q : 'auto';
  } catch {
    return 'auto';
  }
}
