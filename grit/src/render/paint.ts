/**
 * Canvas helpers for the painted-wooden-toy look.
 *
 * Rules of the house style:
 *  - flat opaque fills, never a gradient into black
 *  - a thick dark outline on everything that is an "object"
 *  - a little brush grain and a lighter top edge, so it reads as painted wood
 *    with a cardboard cut edge rather than as vector art
 */

import { TONE } from '../theme'

export const OUTLINE = TONE.ink

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export interface PaintedOptions {
  fill: string
  /** A lighter version of the fill, brushed along the top edge. */
  highlight?: string
  outline?: string
  lineWidth?: number
  radius?: number
}

/** A block of painted wood: fill, top-edge highlight, thick outline. */
export function paintedBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PaintedOptions,
): void {
  const r = opts.radius ?? Math.min(8, h * 0.25)
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = opts.fill
  ctx.fill()

  if (opts.highlight) {
    ctx.save()
    ctx.clip()
    ctx.fillStyle = opts.highlight
    ctx.fillRect(x, y, w, Math.max(2, h * 0.22))
    ctx.restore()
  }

  ctx.lineWidth = opts.lineWidth ?? Math.max(2, Math.min(6, h * 0.09))
  ctx.strokeStyle = opts.outline ?? OUTLINE
  ctx.lineJoin = 'round'
  roundRect(ctx, x, y, w, h, r)
  ctx.stroke()
}

/**
 * A reusable grain tile. Built once and used as a repeating pattern so the
 * whole scene shares one brush texture instead of each object inventing its own.
 */
let grainPattern: CanvasPattern | null = null
let grainSourceCtx: CanvasRenderingContext2D | null = null

export function grain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grainPattern && grainSourceCtx === ctx) return grainPattern

  const tile = document.createElement('canvas')
  tile.width = 96
  tile.height = 96
  const tctx = tile.getContext('2d')
  if (!tctx) return null

  // Deterministic speckle: same grain every run, so screenshots are stable.
  let seed = 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  tctx.clearRect(0, 0, 96, 96)
  for (let i = 0; i < 900; i++) {
    const a = rand() * 0.05
    tctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`
    tctx.fillRect(rand() * 96, rand() * 96, 1.5, 1.5)
  }
  // A few longer brush streaks.
  for (let i = 0; i < 22; i++) {
    tctx.strokeStyle = `rgba(0,0,0,${rand() * 0.03})`
    tctx.lineWidth = 1 + rand() * 2
    tctx.beginPath()
    const y = rand() * 96
    tctx.moveTo(0, y)
    tctx.lineTo(96, y + (rand() - 0.5) * 6)
    tctx.stroke()
  }

  grainPattern = ctx.createPattern(tile, 'repeat')
  grainSourceCtx = ctx
  return grainPattern
}

/** Lay the shared brush grain over an area. */
export function brushOver(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pattern = grain(ctx)
  if (!pattern) return
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = pattern
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

/** Grit specks, used in the meter and on gravel roads. */
export function speckle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  colour: string,
  seedBase = 1,
): void {
  let seed = seedBase * 9301 + 49297
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  ctx.fillStyle = colour
  for (let i = 0; i < count; i++) {
    const px = x + rand() * w
    const py = y + rand() * h
    const s = 1 + rand() * 2.2
    ctx.fillRect(px, py, s, s)
  }
}

/** Set a canvas up for crisp drawing on a retina tablet. Returns CSS size. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): { w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { w, h }
}
