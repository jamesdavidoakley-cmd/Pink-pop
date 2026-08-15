/**
 * The lorry, drawn as a painted wooden toy: flat colour, thick dark outlines,
 * a lighter brushed edge along the top of every panel.
 *
 * Everything is measured in metres in lorry-local space, with the origin on the
 * road under the middle of the lorry and y increasing upwards, then scaled by
 * pixels-per-metre at the last moment. That way the lorry is exactly as big as
 * the physics thinks it is.
 */

import type { TyreId, Zone } from '../physics/constants'
import type { CrateKind } from '../physics/model'
import type { Cosmetics } from '../state/save'
import { PALETTE, TONE } from '../theme'
import { roundRect } from './paint'

export const PAINT_JOBS: Record<string, { body: string; trim: string; label: string }> = {
  haulage: { body: PALETTE.haulageGreen, trim: TONE.cream, label: 'Green' },
  hivis: { body: PALETTE.hiVisOrange, trim: TONE.slateDark, label: 'Orange' },
  slate: { body: PALETTE.wetSlate, trim: PALETTE.hiVisOrange, label: 'Slate' },
  cream: { body: TONE.cream, trim: PALETTE.haulageGreen, label: 'Cream' },
  rust: { body: TONE.rust, trim: TONE.cream, label: 'Red' },
}

export const CRATE_COLOURS: Record<CrateKind, { fill: string; top: string; strap: string }> = {
  brick: { fill: '#9B3D1F', top: '#B85735', strap: '#5E2413' },
  sand: { fill: '#C9A96B', top: '#DECB94', strap: '#8A7440' },
  pipe: { fill: '#3F4B5A', top: '#57677A', strap: '#222A34' },
  hay: { fill: '#C7B26A', top: '#DCC985', strap: '#8B7A40' },
  barrel: { fill: '#2E7A52', top: '#43976A', strap: '#17492F' },
  log: { fill: '#8A5A2B', top: '#A9743E', strap: '#4E3218' },
}

export const ZONE_X: Record<Zone, number> = {
  over_cab: 0.35,
  middle: -1.6,
  over_rear_axle: -3.35,
}

export interface LorryCrate {
  id: string
  mass: number
  kind: CrateKind
  zone: Zone
}

export interface LorryDrawOptions {
  ctx: CanvasRenderingContext2D
  /** Screen position of the road surface under the middle of the lorry. */
  x: number
  y: number
  ppm: number
  slope: number
  wheelAngle: number
  spin: number
  slipping: boolean
  braking: boolean
  crates: LorryCrate[]
  liftAxleRaised: boolean
  cosmetics: Cosmetics
  tyres: TyreId
  mudOnCab: number
  ballast: number
  cabRock: number
  reducedMotion: boolean
}

const FRONT_AXLE = 3.1
const MID_AXLE = -1.5
const REAR_AXLE = -3.2
const WHEEL_R = 0.55

export function drawLorry(opts: LorryDrawOptions): void {
  const { ctx, x, y, ppm, slope, cabRock } = opts
  const paint = PAINT_JOBS[opts.cosmetics.paint] ?? PAINT_JOBS.haulage!

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-slope + cabRock)

  const m = (v: number) => v * ppm
  const line = Math.max(1.6, ppm * 0.055)

  // ---- wheels (behind everything) ----------------------------------------
  drawWheel(ctx, m(FRONT_AXLE), -m(WHEEL_R), m(WHEEL_R), opts.wheelAngle, false, 0, opts, line)
  if (!opts.liftAxleRaised) {
    drawWheel(ctx, m(MID_AXLE), -m(WHEEL_R), m(WHEEL_R), opts.wheelAngle, false, 0, opts, line)
  } else {
    // Raised: tucked up under the chassis, clear of the road.
    drawWheel(
      ctx,
      m(MID_AXLE),
      -m(WHEEL_R + 0.55),
      m(WHEEL_R * 0.92),
      opts.wheelAngle * 0.2,
      false,
      0,
      opts,
      line,
    )
  }
  drawWheel(ctx, m(REAR_AXLE), -m(WHEEL_R), m(WHEEL_R), opts.wheelAngle, true, opts.spin, opts, line)

  // ---- chassis rail -------------------------------------------------------
  panel(ctx, m(-4.5), -m(1.2), m(8.7), m(0.28), TONE.slateDark, TONE.slateLight, line)

  // ---- tipper body --------------------------------------------------------
  const bodyX = m(-4.45)
  const bodyW = m(5.7)
  const floorY = -m(1.4)
  const wallTop = -m(1.78)
  const wallH = m(0.62)

  // Floor of the bed.
  panel(ctx, bodyX, floorY, bodyW, m(0.26), paint.body, tint(paint.body), line)

  // Cargo sits on the floor, drawn before the near wall so it is part-hidden
  // by it — a low-sided tipper, so the load still shows above the rail.
  drawCargo(ctx, opts, m, line)

  // Near-side wall, running from the floor up.
  panel(ctx, bodyX, wallTop, bodyW, wallH, paint.body, tint(paint.body), line)
  // Ribs.
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.lineWidth = line * 0.7
  for (let i = 1; i < 6; i++) {
    const rx = bodyX + (bodyW / 6) * i
    ctx.beginPath()
    ctx.moveTo(rx, wallTop + 3)
    ctx.lineTo(rx, wallTop + wallH - 3)
    ctx.stroke()
  }
  // Tail board, taller than the sides so nothing slides off by accident.
  panel(ctx, bodyX - m(0.12), -m(2.35), m(0.34), m(1.21), tint(paint.body, -18), paint.body, line)

  // ---- ballast tank -------------------------------------------------------
  if (opts.ballast > 0) {
    const fill = Math.min(1, opts.ballast / 1200)
    const tankX = m(-2.9)
    const tankY = -m(1.05)
    const tankW = m(1.7)
    const tankH = m(0.5)
    panel(ctx, tankX, tankY, tankW, tankH, TONE.slateLight, TONE.slateDark, line * 0.8)
    ctx.save()
    roundRect(ctx, tankX + 2, tankY + 2, tankW - 4, tankH - 4, 3)
    ctx.clip()
    ctx.fillStyle = PALETTE.ice
    ctx.fillRect(tankX, tankY + tankH - (tankH - 4) * fill - 2, tankW, (tankH - 4) * fill)
    ctx.restore()
  }

  // ---- cab ----------------------------------------------------------------
  const cabX = m(1.45)
  const cabW = m(2.55)
  const cabTop = -m(3.4)
  const cabH = m(2.25)
  panel(ctx, cabX, cabTop, cabW, cabH, paint.body, tint(paint.body), line, 6)

  // Window.
  const winX = cabX + m(0.28)
  const winY = cabTop + m(0.24)
  const winW = cabW - m(0.5)
  const winH = m(0.95)
  panel(ctx, winX, winY, winW, winH, '#9FC4D2', '#C6E0EA', line * 0.8, 4)

  // Driver, and the dog if bought.
  drawDriver(ctx, winX + winW * 0.34, winY + winH * 0.98, m(0.42), opts)
  if (opts.cosmetics.dog) {
    drawDog(ctx, winX + winW * 0.78, winY + winH * 0.98, m(0.34))
  }

  // Signwriting on the cab door.
  if (opts.cosmetics.signwriting) {
    ctx.save()
    ctx.fillStyle = paint.trim
    const size = Math.max(7, m(0.34))
    ctx.font = `700 ${size}px 'Signwriter', Impact, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.translate(cabX + cabW * 0.5, cabTop + cabH * 0.72)
    ctx.scale(0.92, 1)
    ctx.fillText(opts.cosmetics.signwriting.slice(0, 10).toUpperCase(), 0, 0)
    ctx.restore()
  }

  // Bumper and lights.
  panel(ctx, cabX + cabW - m(0.1), -m(1.35), m(0.42), m(0.55), TONE.slateDark, TONE.slateLight, line * 0.8, 3)
  ctx.fillStyle = '#FFD98A'
  ctx.fillRect(cabX + cabW - m(0.02), -m(1.28), m(0.16), m(0.16))

  // Exhaust stack.
  panel(ctx, cabX - m(0.34), cabTop + m(0.1), m(0.22), m(1.5), TONE.slateLight, '#5C6A7A', line * 0.7, 3)

  // Air horns.
  if (opts.cosmetics.horn !== 'none') {
    ctx.fillStyle = '#D9C48A'
    ctx.strokeStyle = TONE.ink
    ctx.lineWidth = line * 0.6
    for (let i = 0; i < 2; i++) {
      const hx = cabX + m(0.5) + i * m(0.4)
      roundRect(ctx, hx, cabTop - m(0.32), m(0.32), m(0.26), 3)
      ctx.fill()
      ctx.stroke()
    }
  }

  // Mud flaps.
  if (opts.cosmetics.mudflaps) {
    ctx.fillStyle = TONE.slateDark
    ctx.strokeStyle = TONE.ink
    ctx.lineWidth = line * 0.6
    for (const ax of [REAR_AXLE - 0.75, FRONT_AXLE - 0.75]) {
      roundRect(ctx, m(ax), -m(0.72), m(0.16), m(0.6), 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // Mudzilla's handiwork, piled on the front.
  if (opts.mudOnCab > 0) {
    const heap = Math.min(1, opts.mudOnCab / 1400)
    ctx.fillStyle = PALETTE.mudOchre
    ctx.strokeStyle = TONE.mudDark
    ctx.lineWidth = line * 0.8
    ctx.beginPath()
    const hx = cabX + m(0.1)
    const hw = cabW + m(0.5)
    const hh = m(0.4 + heap * 1.5)
    ctx.moveTo(hx, -m(1.35))
    ctx.quadraticCurveTo(hx + hw * 0.3, -m(1.35) - hh, hx + hw * 0.55, -m(1.35) - hh * 0.7)
    ctx.quadraticCurveTo(hx + hw * 0.8, -m(1.35) - hh * 1.1, hx + hw, -m(1.35))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Brake lights.
  if (opts.braking) {
    ctx.fillStyle = '#FF4D2E'
    ctx.strokeStyle = TONE.ink
    ctx.lineWidth = line * 0.6
    roundRect(ctx, m(-4.62), -m(1.9), m(0.2), m(0.34), 2)
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}

function tint(hex: string, amount = 26): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount))
  const b = Math.max(0, Math.min(255, (n & 255) + amount))
  return `rgb(${r},${g},${b})`
}

function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  highlight: string,
  line: number,
  radius = 4,
): void {
  roundRect(ctx, x, y, w, h, radius)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.save()
  roundRect(ctx, x, y, w, h, radius)
  ctx.clip()
  ctx.fillStyle = highlight
  ctx.fillRect(x, y, w, Math.max(1.5, h * 0.16))
  ctx.restore()
  ctx.lineWidth = line
  ctx.strokeStyle = TONE.ink
  ctx.lineJoin = 'round'
  roundRect(ctx, x, y, w, h, radius)
  ctx.stroke()
}

function drawCargo(
  ctx: CanvasRenderingContext2D,
  opts: LorryDrawOptions,
  m: (v: number) => number,
  line: number,
): void {
  const floorY = -m(1.4)
  const byZone: Record<string, LorryCrate[]> = {}
  for (const crate of opts.crates) {
    ;(byZone[crate.zone] ??= []).push(crate)
  }

  for (const [zone, crates] of Object.entries(byZone)) {
    const centreX = m(ZONE_X[zone as Zone])

    // Two across, then start a second layer on top — so a child can always see
    // every box they loaded rather than one hiding behind another.
    const perRow = Math.min(2, crates.length)
    const rowWidths: number[] = []
    crates.forEach((crate, i) => {
      const size = 0.72 + Math.min(1.15, crate.mass / 2000)
      const cw = m(size * 1.2)
      const ch = m(size)
      const colours = CRATE_COLOURS[crate.kind]
      const col = i % perRow
      const row = Math.floor(i / perRow)

      const spread = perRow > 1 ? m(0.62) : 0
      const cx = centreX - cw / 2 + (col - (perRow - 1) / 2) * spread
      const cy = floorY - ch - row * (rowWidths[row - 1] ?? 0)
      rowWidths[row] = ch

      panel(ctx, cx, cy, cw, ch, colours.fill, colours.top, line * 0.8, 3)
      // A strap, so it reads as cargo rather than a coloured box.
      ctx.strokeStyle = colours.strap
      ctx.lineWidth = line * 0.7
      ctx.beginPath()
      ctx.moveTo(cx + cw * 0.5, cy)
      ctx.lineTo(cx + cw * 0.5, cy + ch)
      ctx.stroke()
    })
  }
}

function drawWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  isDrive: boolean,
  spin: number,
  opts: LorryDrawOptions,
  line: number,
): void {
  ctx.save()
  ctx.translate(cx, cy)

  // Tyre.
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = TONE.slateDark
  ctx.fill()
  ctx.lineWidth = line
  ctx.strokeStyle = TONE.ink
  ctx.stroke()

  const blurring = isDrive && spin > 0.15 && !opts.reducedMotion

  // Tread lugs around the rim. Chains and knobblies look different, because
  // they behave differently.
  ctx.save()
  ctx.rotate(angle)
  const lugCount = opts.tyres === 'knobbly' ? 9 : 12
  const lugLength = opts.tyres === 'knobbly' ? r * 0.34 : r * 0.22
  ctx.strokeStyle = blurring ? 'rgba(70,82,95,0.55)' : '#46525F'
  ctx.lineWidth = Math.max(1.4, r * (opts.tyres === 'knobbly' ? 0.26 : 0.18))
  ctx.lineCap = 'butt'
  for (let i = 0; i < lugCount; i++) {
    const a = (i / lugCount) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * (r - lugLength), Math.sin(a) * (r - lugLength))
    ctx.lineTo(Math.cos(a) * (r - 1), Math.sin(a) * (r - 1))
    ctx.stroke()
  }
  if (opts.tyres === 'chains') {
    ctx.strokeStyle = '#C7CDD4'
    ctx.lineWidth = Math.max(1.2, r * 0.09)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.78, a, a + 0.5)
      ctx.stroke()
    }
  }
  ctx.restore()

  // Hub.
  ctx.save()
  ctx.rotate(blurring ? 0 : angle)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2)
  ctx.fillStyle = blurring ? '#6A7686' : TONE.gritDark
  ctx.fill()
  ctx.lineWidth = line * 0.8
  ctx.strokeStyle = TONE.ink
  ctx.stroke()
  if (!blurring) {
    ctx.fillStyle = TONE.slateDark
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.26, Math.max(1, r * 0.075), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Spin blur: arcs whipping round the rim.
  if (blurring) {
    ctx.strokeStyle = `rgba(226,232,238,${0.15 + spin * 0.4})`
    ctx.lineWidth = Math.max(1.5, r * 0.13)
    for (let i = 0; i < 3; i++) {
      const a = angle * 2.4 + (i / 3) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.72, a, a + 1.1)
      ctx.stroke()
    }
  }

  ctx.restore()
}

function drawDriver(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  size: number,
  opts: LorryDrawOptions,
): void {
  // Body.
  ctx.fillStyle = PALETTE.hiVisOrange
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = Math.max(1, size * 0.16)
  roundRect(ctx, x - size * 0.5, baseY - size * 0.9, size, size * 0.95, size * 0.2)
  ctx.fill()
  ctx.stroke()

  // Head.
  ctx.beginPath()
  ctx.arc(x, baseY - size * 1.15, size * 0.42, 0, Math.PI * 2)
  ctx.fillStyle = '#E7BE93'
  ctx.fill()
  ctx.stroke()

  const hat = opts.cosmetics.hat
  if (hat && hat !== 'none') {
    const hatColours: Record<string, string> = {
      cap: PALETTE.haulageGreen,
      beanie: '#9B3D1F',
      hardhat: '#FFD24A',
    }
    ctx.fillStyle = hatColours[hat] ?? PALETTE.haulageGreen
    ctx.beginPath()
    ctx.arc(x, baseY - size * 1.25, size * 0.46, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    if (hat === 'cap') {
      ctx.fillRect(x + size * 0.2, baseY - size * 1.3, size * 0.5, size * 0.12)
      ctx.strokeRect(x + size * 0.2, baseY - size * 1.3, size * 0.5, size * 0.12)
    }
  }
}

function drawDog(ctx: CanvasRenderingContext2D, x: number, baseY: number, size: number): void {
  ctx.fillStyle = '#C9A96B'
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = Math.max(1, size * 0.18)
  // Head.
  ctx.beginPath()
  ctx.arc(x, baseY - size * 0.7, size * 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // Ears.
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(x + dir * size * 0.45, baseY - size * 0.9, size * 0.17, size * 0.32, dir * 0.4, 0, Math.PI * 2)
    ctx.fillStyle = '#8A5A2B'
    ctx.fill()
    ctx.stroke()
  }
  // Snout.
  ctx.fillStyle = TONE.slateDark
  ctx.beginPath()
  ctx.arc(x + size * 0.3, baseY - size * 0.62, size * 0.12, 0, Math.PI * 2)
  ctx.fill()
}
