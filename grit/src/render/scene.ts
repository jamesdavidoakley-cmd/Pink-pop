/**
 * The drive view: a side-on diorama, the sort of thing that would sit on a
 * board in a spare room. Cardboard-edge hills, felt grass, painted wooden
 * buildings, and a road band you can see the near edge of — which is what lets
 * the lorry visibly slide wide on a bend.
 */

import { elevationAt, sampleTrack, trackLength, type SurfacePatch, type Track } from '../physics/track'
import { SURFACE_COLOURS, TONE, PALETTE } from '../theme'
import type { DriveSim } from '../game/driveSim'
import type { Cosmetics } from '../state/save'
import { drawLorry, type LorryCrate } from './lorry'
import { brushOver, roundRect } from './paint'

export interface SceneView {
  sim: DriveSim
  cosmetics: Cosmetics
  reducedMotion: boolean
  time: number
  braking: boolean
}

const ROAD_DEPTH = 56
const LAT_PPM = 11

/** Cheap deterministic hash, so the scenery is in the same place every run. */
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  view: SceneView,
): void {
  const { sim } = view
  const track = sim.level.track
  const ppm = Math.max(16, Math.min(40, w / 38))
  const originX = w * 0.34
  const horizon = h * 0.44
  const groundY = h * 0.64

  const camS = sim.state.s
  const camElev = elevationAt(track, camS)

  const sAt = (screenX: number) => camS + (screenX - originX) / ppm
  const xAt = (s: number) => originX + (s - camS) * ppm
  const roadY = (s: number) => groundY - (elevationAt(track, s) - camElev) * ppm

  ctx.clearRect(0, 0, w, h)
  drawSky(ctx, w, h, horizon)
  drawHills(ctx, w, h, horizon, camS, camElev, ppm)
  drawGround(ctx, w, h, track, sim.patches, sAt, roadY)
  drawRoadFurniture(ctx, w, sim, xAt, roadY, view)
  drawScenery(ctx, w, h, camS, sAt, roadY, ppm)

  if (sim.boss.kind) drawBoss(ctx, sim, xAt, roadY, ppm, view)

  drawParticles(ctx, sim, xAt, roadY, ppm)
  drawTheLorry(ctx, sim, xAt, roadY, ppm, view)
  drawForeground(ctx, w, h, camS, ppm)

  brushOver(ctx, 0, 0, w, h)
}

// ---------------------------------------------------------------------------

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number): void {
  ctx.fillStyle = TONE.sky
  ctx.fillRect(0, 0, w, horizon)
  // A warm band just above the hills, the way a painted backdrop is done.
  ctx.fillStyle = TONE.skyWarm
  ctx.fillRect(0, horizon - h * 0.09, w, h * 0.09)
  ctx.fillStyle = '#F5EFE0'
  ctx.beginPath()
  ctx.arc(w * 0.78, horizon * 0.32, h * 0.055, 0, Math.PI * 2)
  ctx.fill()

  // The field between the hills and the roadside, so there is never a gap
  // between the backdrop and the ground the lorry is standing on.
  ctx.fillStyle = '#4C9160'
  ctx.fillRect(0, horizon - 2, w, h - horizon + 2)
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  camS: number,
  camElev: number,
  ppm: number,
): void {
  const layers = [
    { parallax: 0.12, colour: '#8FA5A8', top: '#A3B7B9', height: h * 0.14, span: 260 },
    { parallax: 0.3, colour: '#5F7F63', top: '#719374', height: h * 0.1, span: 180 },
  ]

  for (const layer of layers) {
    const offset = -camS * layer.parallax * ppm
    const baseY = horizon + camElev * ppm * layer.parallax * 0.4

    const ridge: [number, number][] = []
    for (let x = -40; x <= w + 40; x += 20) {
      const s = (x - offset) / layer.span
      const y =
        baseY - Math.abs(Math.sin(s * 0.9)) * layer.height - Math.sin(s * 2.3) * layer.height * 0.22
      ridge.push([x, y])
    }

    // Fill all the way to the bottom: each layer hides behind the next one in
    // rather than showing a flat cut-off edge halfway down the field.
    ctx.fillStyle = layer.colour
    ctx.beginPath()
    ctx.moveTo(-40, h)
    for (const [x, y] of ridge) ctx.lineTo(x, y)
    ctx.lineTo(w + 40, h)
    ctx.closePath()
    ctx.fill()

    // The lighter cut edge along the top, like card with the colour showing.
    ctx.strokeStyle = layer.top
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ridge.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.stroke()
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  track: Track,
  patches: SurfacePatch[],
  sAt: (x: number) => number,
  roadY: (s: number) => number,
): void {
  const STEP = 5

  // Earth below everything.
  ctx.fillStyle = '#6B5334'
  ctx.beginPath()
  ctx.moveTo(-STEP, h)
  for (let x = -STEP; x <= w + STEP; x += STEP) ctx.lineTo(x, roadY(sAt(x)) - 10)
  ctx.lineTo(w + STEP, h)
  ctx.closePath()
  ctx.fill()

  // Far verge: felt grass above the road.
  ctx.fillStyle = TONE.grass
  ctx.beginPath()
  ctx.moveTo(-STEP, h)
  for (let x = -STEP; x <= w + STEP; x += STEP) ctx.lineTo(x, roadY(sAt(x)) - 16)
  ctx.lineTo(w + STEP, h)
  ctx.closePath()
  ctx.fill()

  // Road surface, column by column so a change of surface is a hard edge.
  for (let x = -STEP; x <= w + STEP; x += STEP) {
    const s = sAt(x)
    const point = sampleTrack(track, s, patches).surface
    const colour = SURFACE_COLOURS[point]
    const y = roadY(s)
    ctx.fillStyle = colour.top
    ctx.fillRect(x, y, STEP + 1, ROAD_DEPTH)
    // The near edge catches the light differently.
    ctx.fillStyle = colour.side
    ctx.fillRect(x, y + ROAD_DEPTH - 7, STEP + 1, 7)
    // Speckle for loose surfaces.
    if (point === 'gravel' || point === 'mud' || point === 'snow') {
      const seed = Math.floor(s * 3)
      if (hash(seed) > 0.55) {
        ctx.fillStyle = colour.speck
        ctx.fillRect(x + hash(seed + 1) * STEP, y + 6 + hash(seed + 2) * (ROAD_DEPTH - 14), 3, 3)
      }
    }
  }

  // Kerb lines top and bottom.
  ctx.lineWidth = 3
  ctx.strokeStyle = TONE.ink
  for (const dy of [0, ROAD_DEPTH]) {
    ctx.beginPath()
    for (let x = -STEP; x <= w + STEP; x += STEP) {
      const y = roadY(sAt(x)) + dy
      if (x === -STEP) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // Near verge grass below the road.
  ctx.fillStyle = TONE.grassDark
  ctx.beginPath()
  ctx.moveTo(-STEP, h)
  for (let x = w + STEP; x >= -STEP; x -= STEP) ctx.lineTo(x, roadY(sAt(x)) + ROAD_DEPTH)
  ctx.lineTo(-STEP, h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = TONE.grassLight
  ctx.lineWidth = 4
  ctx.beginPath()
  for (let x = -STEP; x <= w + STEP; x += STEP) {
    const y = roadY(sAt(x)) + ROAD_DEPTH + 3
    if (x === -STEP) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// ---------------------------------------------------------------------------

function drawRoadFurniture(
  ctx: CanvasRenderingContext2D,
  w: number,
  sim: DriveSim,
  xAt: (s: number) => number,
  roadY: (s: number) => number,
  view: SceneView,
): void {
  const level = sim.level
  const length = trackLength(level.track)

  // Recovery boards lying on the road.
  for (const p of sim.boardPositions) {
    const x = xAt(p)
    if (x < -80 || x > w + 80) continue
    const y = roadY(p) + ROAD_DEPTH * 0.5
    ctx.save()
    ctx.fillStyle = '#D9A441'
    ctx.strokeStyle = TONE.ink
    ctx.lineWidth = 2.5
    roundRect(ctx, x, y - 6, xAt(p + 6) - x, 12, 3)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // The stop box.
  const mark = sim.run.markAt
  if (mark !== undefined) {
    const tol = sim.run.markTolerance ?? 7
    const x1 = xAt(mark - tol)
    const x2 = xAt(mark + tol)
    if (x2 > -100 && x1 < w + 100) {
      ctx.save()
      ctx.strokeStyle = PALETTE.hiVisOrange
      ctx.lineWidth = 6
      ctx.setLineDash([14, 10])
      const y = roadY(mark)
      ctx.strokeRect(x1, y + 4, x2 - x1, ROAD_DEPTH - 8)
      ctx.setLineDash([])
      ctx.restore()
      drawSign(ctx, xAt(mark), roadY(mark) - 18, 'stop')
    }
  }

  // The gravel escape lane on the runaway hill.
  if (level.escapeLaneAt !== undefined) {
    const s = level.escapeLaneAt
    const x = xAt(s)
    if (x > -240 && x < w + 240) {
      const y = roadY(s)
      ctx.save()
      ctx.fillStyle = SURFACE_COLOURS.gravel.top
      ctx.strokeStyle = TONE.ink
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, y + ROAD_DEPTH)
      ctx.lineTo(x + 150, y + ROAD_DEPTH + 46)
      ctx.lineTo(x + 150, y + ROAD_DEPTH + 78)
      ctx.lineTo(x - 10, y + ROAD_DEPTH + 4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      drawSign(ctx, x + 40, y - 18, 'escape')
    }
  }

  // Bend warning boards, a little before each bend.
  let acc = 0
  for (const segment of level.track.segments) {
    if (segment.bendRadius) {
      const signS = acc - 16
      const x = xAt(signS)
      if (x > -120 && x < w + 120) {
        drawSign(ctx, x, roadY(signS) - 18, segment.bendDir === -1 ? 'bend-left' : 'bend-right')
      }
      // Cones along the outer edge of the bend.
      for (let s = acc; s < acc + segment.length; s += 7) {
        const cx = xAt(s)
        if (cx < -40 || cx > w + 40) continue
        drawCone(ctx, cx, roadY(s) + ROAD_DEPTH + 2)
      }
    }
    acc += segment.length
  }

  // Start and finish.
  drawBanner(ctx, xAt(0), roadY(0), 'START')
  if (mark === undefined) drawBanner(ctx, xAt(length - 2), roadY(length - 2), 'TIP')

  if (view.reducedMotion) return
}

function drawSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: 'bend-left' | 'bend-right' | 'stop' | 'escape',
): void {
  ctx.save()
  ctx.translate(x, y)
  // Post.
  ctx.fillStyle = '#7C6A50'
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 2.5
  ctx.fillRect(-3, 0, 6, 26)
  ctx.strokeRect(-3, 0, 6, 26)

  const size = 30
  ctx.fillStyle = kind === 'escape' ? PALETTE.haulageGreen : PALETTE.hiVisOrange
  roundRect(ctx, -size / 2, -size, size, size, 6)
  ctx.fill()
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.strokeStyle = TONE.cream
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (kind === 'bend-right' || kind === 'bend-left') {
    const dir = kind === 'bend-right' ? 1 : -1
    ctx.moveTo(-dir * 7, -size * 0.22)
    ctx.lineTo(dir * 2, -size * 0.5)
    ctx.lineTo(dir * 7, -size * 0.78)
  } else if (kind === 'stop') {
    ctx.moveTo(-7, -size * 0.5)
    ctx.lineTo(7, -size * 0.5)
    ctx.moveTo(0, -size * 0.78)
    ctx.lineTo(0, -size * 0.22)
  } else {
    ctx.moveTo(0, -size * 0.22)
    ctx.lineTo(0, -size * 0.78)
    ctx.moveTo(-6, -size * 0.55)
    ctx.lineTo(0, -size * 0.8)
    ctx.lineTo(6, -size * 0.55)
  }
  ctx.stroke()
  ctx.restore()
}

function drawCone(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save()
  ctx.fillStyle = PALETTE.hiVisOrange
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y - 16)
  ctx.lineTo(x + 7, y)
  ctx.lineTo(x - 7, y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = TONE.cream
  ctx.fillRect(x - 4.5, y - 9, 9, 3.5)
  ctx.restore()
}

function drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  if (x < -200 || x > 3000) return
  ctx.save()
  ctx.strokeStyle = '#7C6A50'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(x - 46, y + ROAD_DEPTH)
  ctx.lineTo(x - 46, y - 74)
  ctx.moveTo(x + 46, y + ROAD_DEPTH)
  ctx.lineTo(x + 46, y - 74)
  ctx.stroke()

  ctx.fillStyle = PALETTE.haulageGreen
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 4
  roundRect(ctx, x - 58, y - 96, 116, 30, 6)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = TONE.cream
  ctx.font = "700 18px 'Signwriter', Impact, sans-serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y - 80)
  ctx.restore()
}

// ---------------------------------------------------------------------------

function drawScenery(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  camS: number,
  sAt: (x: number) => number,
  roadY: (s: number) => number,
  ppm: number,
): void {
  const spacing = 16
  const first = Math.floor((sAt(-120) - 4) / spacing)
  const last = Math.ceil(sAt(w + 120) / spacing)

  for (let i = first; i <= last; i++) {
    const s = i * spacing + hash(i) * 7
    const x = (s - camS) * ppm + w * 0.34
    const y = roadY(s) - 18
    const pick = hash(i * 3.7)

    if (pick < 0.42) drawTree(ctx, x, y, 0.8 + hash(i * 5.1) * 0.6)
    else if (pick < 0.6) drawPole(ctx, x, y)
    else if (pick < 0.74) drawShed(ctx, x, y, hash(i * 2.3))
    else if (pick < 0.86) drawBales(ctx, x, y)
    else drawFence(ctx, x, y)
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = '#6B5334'
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 3
  ctx.fillRect(-5, -34, 10, 34)
  ctx.strokeRect(-5, -34, 10, 34)
  // Felt-like canopy: three overlapping blobs.
  const blobs: [number, number, number][] = [
    [0, -62, 26],
    [-17, -50, 19],
    [17, -50, 19],
  ]
  for (const [bx, by, r] of blobs) {
    ctx.beginPath()
    ctx.arc(bx, by, r, 0, Math.PI * 2)
    ctx.fillStyle = TONE.grassDark
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(-6, -70, 12, 0, Math.PI * 2)
  ctx.fillStyle = TONE.grass
  ctx.fill()
  ctx.restore()
}

function drawPole(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save()
  ctx.fillStyle = '#7C6A50'
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 3
  ctx.fillRect(x - 4, y - 86, 8, 86)
  ctx.strokeRect(x - 4, y - 86, 8, 86)
  ctx.fillRect(x - 20, y - 80, 40, 6)
  ctx.strokeRect(x - 20, y - 80, 40, 6)
  ctx.restore()
}

function drawShed(ctx: CanvasRenderingContext2D, x: number, y: number, tone: number): void {
  ctx.save()
  const body = tone > 0.5 ? PALETTE.mudOchre : '#8C7A5E'
  ctx.fillStyle = body
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 3.5
  ctx.fillRect(x - 34, y - 48, 68, 48)
  ctx.strokeRect(x - 34, y - 48, 68, 48)
  ctx.fillStyle = TONE.rust
  ctx.beginPath()
  ctx.moveTo(x - 42, y - 48)
  ctx.lineTo(x, y - 72)
  ctx.lineTo(x + 42, y - 48)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = TONE.slateDark
  ctx.fillRect(x - 10, y - 26, 20, 26)
  ctx.strokeRect(x - 10, y - 26, 20, 26)
  ctx.restore()
}

function drawBales(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save()
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 3
  for (const [bx, by] of [
    [0, 0],
    [24, 0],
    [12, -20],
  ] as const) {
    ctx.fillStyle = '#C7B26A'
    roundRect(ctx, x + bx - 12, y + by - 20, 24, 20, 4)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save()
  ctx.strokeStyle = '#7C6A50'
  ctx.lineWidth = 4
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(x + i * 16, y)
    ctx.lineTo(x + i * 16, y - 22)
  }
  ctx.moveTo(x - 4, y - 16)
  ctx.lineTo(x + 52, y - 16)
  ctx.stroke()
  ctx.restore()
}

function drawForeground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camS: number,
  ppm: number,
): void {
  // A few tufts of grass right at the front, moving faster than the road.
  const spacing = 9
  const offset = -camS * ppm * 1.25
  const first = Math.floor((-offset - 60) / (spacing * ppm))
  for (let i = first; i < first + 40; i++) {
    const x = i * spacing * ppm + offset
    if (x < -40 || x > w + 40) continue
    const hgt = 14 + hash(i) * 18
    ctx.strokeStyle = i % 3 === 0 ? TONE.grassLight : TONE.grassDark
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, h + 4)
    ctx.quadraticCurveTo(x + 5, h - hgt * 0.6, x + 12, h - hgt)
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------

function drawParticles(
  ctx: CanvasRenderingContext2D,
  sim: DriveSim,
  xAt: (s: number) => number,
  roadY: (s: number) => number,
  ppm: number,
): void {
  for (const p of sim.particles) {
    const x = xAt(p.x)
    const y = roadY(p.x) + ROAD_DEPTH * 0.55 + p.y * ppm
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife))
    ctx.fillStyle = p.colour
    ctx.fillRect(x, y, p.size, p.size)
  }
  ctx.globalAlpha = 1
}

function drawTheLorry(
  ctx: CanvasRenderingContext2D,
  sim: DriveSim,
  xAt: (s: number) => number,
  roadY: (s: number) => number,
  ppm: number,
  view: SceneView,
): void {
  const s = sim.state.s
  const x = xAt(s)
  const y = roadY(s) + ROAD_DEPTH * 0.55 + sim.state.lat * LAT_PPM
  const point = sampleTrack(sim.level.track, s, sim.patches)

  // The cab rocks when the wheel is spinning: the lorry is trying and failing.
  const rock = view.reducedMotion
    ? 0
    : Math.sin(view.time * 17) * 0.035 * sim.state.spin +
      Math.sin(view.time * 5.5) * 0.006 * Math.min(1, Math.abs(sim.state.v) / 8)

  const crates: LorryCrate[] = sim.rig.crates
    .filter((c) => c.zone !== null && !c.lost)
    .map((c) => ({ id: c.id, mass: c.mass, kind: c.kind, zone: c.zone! }))

  // Shadow, so the lorry sits on the road rather than floating over it.
  ctx.save()
  ctx.globalAlpha = 0.22
  ctx.fillStyle = TONE.ink
  ctx.beginPath()
  ctx.ellipse(x, y + 4, 4.6 * ppm, 0.42 * ppm, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  drawLorry({
    ctx,
    x,
    y,
    ppm,
    slope: point.slope,
    wheelAngle: sim.state.wheelAngle,
    spin: sim.state.spin,
    slipping: sim.state.isSlipping,
    braking: view.braking,
    crates,
    liftAxleRaised: sim.rig.liftAxleRaised,
    cosmetics: view.cosmetics,
    tyres: sim.rig.tyres,
    mudOnCab: sim.rig.mudOnCabKg,
    ballast: sim.rig.ballastKg,
    cabRock: rock,
    reducedMotion: view.reducedMotion,
  })
}

// ---------------------------------------------------------------------------

function drawBoss(
  ctx: CanvasRenderingContext2D,
  sim: DriveSim,
  xAt: (s: number) => number,
  roadY: (s: number) => number,
  ppm: number,
  view: SceneView,
): void {
  const boss = sim.boss
  const x = xAt(boss.position)
  const y = roadY(boss.position) + ROAD_DEPTH * 0.4
  const t = view.reducedMotion ? 0 : view.time

  if (boss.kind === 'slick') drawSlick(ctx, x, y, ppm, t, boss.mood)
  if (boss.kind === 'mudzilla') drawMudzilla(ctx, x, y + ppm * 0.3, ppm, t, boss.mood)
}

function drawSlick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppm: number,
  t: number,
  mood: string,
): void {
  ctx.save()
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 4

  // A slithering body: overlapping rounded segments on a sine.
  const segments = 9
  for (let i = segments - 1; i >= 0; i--) {
    const sx = x - i * ppm * 0.52
    const sy = y - Math.sin(t * 3 + i * 0.7) * ppm * 0.42 - ppm * 0.5
    const r = ppm * (0.52 - i * 0.022)
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fillStyle = i % 2 === 0 ? PALETTE.ice : TONE.iceDark
    ctx.fill()
    ctx.stroke()
  }

  // Head.
  const hx = x + ppm * 0.5
  const hy = y - Math.sin(t * 3 - 0.7) * ppm * 0.42 - ppm * 0.62
  ctx.beginPath()
  ctx.ellipse(hx, hy, ppm * 0.72, ppm * 0.56, 0, 0, Math.PI * 2)
  ctx.fillStyle = TONE.iceLight
  ctx.fill()
  ctx.stroke()

  // Eyes: cross when he is losing, droopy when beaten.
  ctx.fillStyle = TONE.ink
  for (const dx of [-0.2, 0.28]) {
    ctx.beginPath()
    ctx.arc(hx + dx * ppm, hy - ppm * 0.14, ppm * 0.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  if (mood === 'beaten') {
    ctx.arc(hx + ppm * 0.1, hy + ppm * 0.3, ppm * 0.2, Math.PI * 1.15, Math.PI * 1.85)
  } else {
    ctx.moveTo(hx - ppm * 0.1, hy + ppm * 0.22)
    ctx.lineTo(hx + ppm * 0.36, hy + ppm * 0.22)
  }
  ctx.stroke()

  // Frosty breath, which is what is freezing the road.
  if (mood !== 'beaten') {
    ctx.globalAlpha = 0.5
    ctx.fillStyle = TONE.iceLight
    for (let i = 0; i < 4; i++) {
      const px = hx - ppm * (0.8 + i * 0.7) - ((t * 40) % 30)
      ctx.beginPath()
      ctx.arc(px, hy + ppm * 0.5 + Math.sin(t * 4 + i) * 4, ppm * 0.18, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

function drawMudzilla(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ppm: number,
  t: number,
  mood: string,
): void {
  ctx.save()
  const bob = Math.sin(t * 2.4) * ppm * 0.12
  const r = ppm * 2.1

  ctx.strokeStyle = TONE.mudDark
  ctx.lineWidth = 5

  // A cheerful heap of a body.
  ctx.beginPath()
  ctx.moveTo(x - r, y)
  ctx.quadraticCurveTo(x - r * 1.05, y - r * 1.5 + bob, x, y - r * 1.55 + bob)
  ctx.quadraticCurveTo(x + r * 1.05, y - r * 1.5 + bob, x + r, y)
  ctx.closePath()
  ctx.fillStyle = PALETTE.mudOchre
  ctx.fill()
  ctx.stroke()

  // Drips.
  ctx.fillStyle = TONE.mudDark
  for (let i = 0; i < 4; i++) {
    const dx = x - r * 0.7 + i * r * 0.45
    const dy = y - Math.abs(Math.sin(t * 2 + i)) * ppm * 0.3
    ctx.beginPath()
    ctx.ellipse(dx, dy, ppm * 0.14, ppm * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Eyes and a big grin — he is having a lovely time.
  ctx.fillStyle = TONE.cream
  for (const dx of [-0.42, 0.34]) {
    ctx.beginPath()
    ctx.arc(x + dx * r, y - r * 0.95 + bob, ppm * 0.26, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = TONE.mudDark
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = TONE.ink
    ctx.beginPath()
    ctx.arc(x + dx * r + ppm * 0.06, y - r * 0.95 + bob, ppm * 0.11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = TONE.cream
  }

  ctx.strokeStyle = TONE.ink
  ctx.lineWidth = 4
  ctx.beginPath()
  if (mood === 'beaten') {
    ctx.arc(x, y - r * 0.3 + bob, r * 0.4, Math.PI * 0.15, Math.PI * 0.85)
  } else {
    ctx.arc(x, y - r * 0.5 + bob, r * 0.42, Math.PI * 0.1, Math.PI * 0.9)
  }
  ctx.stroke()
  ctx.restore()
}
