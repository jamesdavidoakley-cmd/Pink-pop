/**
 * THE GRIP METER.
 *
 * A slice of tyre tread stood on its end. The grooves fill with grit as the
 * grip you have goes up. A hi-vis marker rides up the side showing the grip you
 * are asking for. When the marker overtakes the grit, the tread pattern smears
 * sideways and grit sprays off the top — which is the moment the child learns
 * what they have just done, before they have heard a single word about it.
 *
 * Nothing in here is a number to the player.
 */

import { useEffect, useRef } from 'react'
import { PALETTE, TONE } from '../theme'
import { fitCanvas, roundRect, speckle } from '../render/paint'

export interface GripSnapshot {
  /** Grip available, as a fraction of the meter's fixed yardstick. */
  grip: number
  /** Grip being asked for, same yardstick. Can exceed 1. */
  demand: number
  slipping: boolean
}

export const emptySnapshot = (): GripSnapshot => ({ grip: 0, demand: 0, slipping: false })

interface Props {
  snapshotRef: { current: GripSnapshot }
  reducedMotion?: boolean
  /** Grown-up panel only. */
  showNumbers?: boolean
  numbers?: { sticky: number; press: number; grip: number; demand: number }
  className?: string
  /** Drops the sidewall furniture for the small inline meter in the load bay. */
  compact?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const GROOVE = '#0F141A'
const LUG = '#2B3440'
const LUG_TOP = '#46525F'
const SIDEWALL = '#1B222B'

export function GripMeter({
  snapshotRef,
  reducedMotion = false,
  showNumbers = false,
  numbers,
  className,
  compact = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Displayed values chase the true ones, so the needle never strobes.
  const shown = useRef<GripSnapshot>(emptySnapshot())
  const timeRef = useRef(0)
  const sprayRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      timeRef.current += dt

      const target = snapshotRef.current
      const chase = reducedMotion ? 1 : Math.min(1, dt * 14)
      shown.current.grip += (target.grip - shown.current.grip) * chase
      shown.current.demand += (target.demand - shown.current.demand) * chase
      shown.current.slipping = target.slipping

      draw(ctx, canvas)
      raf = requestAnimationFrame(frame)
    }

    const draw = (c: CanvasRenderingContext2D, el: HTMLCanvasElement) => {
      const { w, h } = fitCanvas(el, c)
      c.clearRect(0, 0, w, h)

      const s = shown.current
      const t = timeRef.current
      const grip = clamp(s.grip, 0, 1)
      const demand = clamp(s.demand, 0, 1.18)
      const overshoot = Math.max(0, demand - grip)
      const smear = reducedMotion ? 0 : clamp(overshoot * 3.2, 0, 1)

      // Room down each side for the demand chevrons to sit outside the tyre.
      const pad = compact ? 8 : 17
      const bodyX = pad
      const bodyY = pad
      const bodyW = w - pad * 2
      const bodyH = h - pad * 2
      const shoulder = bodyW * (compact ? 0.13 : 0.16)
      const treadX = bodyX + shoulder
      const treadW = bodyW - shoulder * 2
      const treadPad = compact ? 6 : 13
      const treadY = bodyY + treadPad
      const treadH = bodyH - treadPad * 2
      const bodyR = compact ? 12 : 22

      // Chunky rows, few of them. A toy tyre has big blocks, not fine sipes.
      const rows = Math.max(4, Math.min(11, Math.round(treadH / (compact ? 20 : 36))))
      const rowH = treadH / rows
      const blockH = rowH * 0.64

      // ---- carcass -------------------------------------------------------
      roundRect(c, bodyX, bodyY, bodyW, bodyH, bodyR)
      c.fillStyle = SIDEWALL
      c.fill()

      // Shoulder lugs: chunky notches down each edge. This is what makes the
      // silhouette read as a tyre rather than as a battery.
      for (let r = 0; r < rows; r++) {
        const y = treadY + r * rowH + (rowH - blockH) / 2
        const nw = shoulder + 4
        for (const nx of [bodyX - 2, bodyX + bodyW - nw + 2]) {
          roundRect(c, nx, y, nw, blockH, 4)
          c.fillStyle = LUG
          c.fill()
          c.fillStyle = LUG_TOP
          c.fillRect(nx + 3, y + 2, Math.max(0, nw - 6), 2)
        }
      }

      c.lineWidth = compact ? 3 : 5
      c.strokeStyle = TONE.ink
      c.lineJoin = 'round'
      roundRect(c, bodyX, bodyY, bodyW, bodyH, bodyR)
      c.stroke()

      // ---- the tread channel ---------------------------------------------
      c.save()
      roundRect(c, treadX, treadY, treadW, treadH, compact ? 6 : 10)
      c.clip()

      // Empty groove floor.
      c.fillStyle = GROOVE
      c.fillRect(treadX, treadY, treadW, treadH)

      // Grit, filled from the bottom up to the grip line.
      const gripY = treadY + treadH * (1 - grip)
      const gritH = treadH - (gripY - treadY)
      if (grip > 0.001) {
        const wobble = smear > 0 ? Math.sin(t * 18) * 3.5 * smear : 0
        c.fillStyle = PALETTE.gritGrey
        c.fillRect(treadX - 4 + wobble, gripY, treadW + 8, gritH)
        // Packed and darker at the bottom, loose and bright at the crest.
        c.fillStyle = TONE.gritDark
        c.fillRect(treadX - 4, treadY + treadH - gritH * 0.14, treadW + 8, gritH * 0.14)
        c.fillStyle = TONE.gritLight
        c.fillRect(treadX - 4 + wobble, gripY, treadW + 8, 4)
        speckle(c, treadX, gripY, treadW, gritH, Math.round(gritH * 0.7), 'rgba(0,0,0,0.18)', 3)
        speckle(c, treadX, gripY, treadW, gritH, Math.round(gritH * 0.3), 'rgba(255,255,255,0.3)', 11)
      }

      // ---- lugs, which are what smear ------------------------------------
      const centreGroove = treadW * 0.16

      const drawLugs = (offsetX: number, alpha: number) => {
        c.globalAlpha = alpha
        for (let r = 0; r < rows; r++) {
          const y = treadY + r * rowH + (rowH - blockH) / 2
          // A zigzag centre groove: alternate rows lean the other way.
          const lean = (r % 2 === 0 ? 1 : -1) * treadW * 0.07
          const travel = smear > 0 ? Math.sin(t * 13 + r * 0.7) * 0.35 + 0.65 : 0
          const dx = offsetX * travel

          const leftW = treadW / 2 - centreGroove / 2 + lean
          const rightX = treadX + treadW / 2 + centreGroove / 2 + lean
          const rightW = treadW / 2 - centreGroove / 2 - lean

          for (const [bx, bw] of [
            [treadX - 5 + dx, leftW + 5],
            [rightX + dx, rightW + 5],
          ] as const) {
            roundRect(c, bx, y, bw, blockH, 4)
            c.fillStyle = LUG
            c.fill()
            c.fillStyle = LUG_TOP
            c.fillRect(bx + 3, y + 2, Math.max(0, bw - 6), 2.5)
          }
        }
        c.globalAlpha = 1
      }

      if (smear > 0) {
        // Ghosts trailing the drag direction sell the smear as movement.
        drawLugs(smear * 34, 0.26)
        drawLugs(smear * 19, 0.44)
      }
      drawLugs(smear * 7, 1)

      // A hazard stripe raked across the grit line itself — narrow, so the
      // smear stays the thing you notice rather than a wash of orange.
      if (overshoot > 0.002 && grip > 0.001) {
        const bandH = compact ? 5 : 8
        c.save()
        c.beginPath()
        c.rect(treadX - 4, gripY - bandH / 2, treadW + 8, bandH)
        c.clip()
        c.fillStyle = PALETTE.hiVisOrange
        c.fillRect(treadX - 4, gripY - bandH / 2, treadW + 8, bandH)
        c.strokeStyle = 'rgba(27,34,43,0.85)'
        c.lineWidth = 4
        const drift = reducedMotion ? 0 : (t * 40) % 16
        for (let x = treadX - 24 + drift; x < treadX + treadW + 12; x += 16) {
          c.beginPath()
          c.moveTo(x, gripY + bandH)
          c.lineTo(x + bandH * 1.6, gripY - bandH)
          c.stroke()
        }
        c.restore()
      }

      // The tread curving away over the shoulder, top and bottom. Flat bands
      // with a hard edge — a cardboard cut, not a gradient.
      const capH = treadH * 0.045
      c.fillStyle = 'rgba(15,20,26,0.55)'
      c.fillRect(treadX - 4, treadY, treadW + 8, capH)
      c.fillRect(treadX - 4, treadY + treadH - capH, treadW + 8, capH)

      c.restore()

      // ---- grit spraying off the top when you overdo it -------------------
      if (!reducedMotion) {
        const spray = sprayRef.current
        if (overshoot > 0.02 && grip > 0.02 && spray.length < 26) {
          spray.push({
            x: treadX + Math.random() * treadW,
            y: gripY,
            vx: (40 + Math.random() * 70) * (0.4 + smear),
            vy: -50 - Math.random() * 90 * (0.4 + smear),
            life: 0.32 + Math.random() * 0.25,
          })
        }
        c.fillStyle = TONE.gritLight
        for (let i = spray.length - 1; i >= 0; i--) {
          const p = spray[i]!
          p.life -= 0.016
          if (p.life <= 0) {
            spray.splice(i, 1)
            continue
          }
          p.x += p.vx * 0.016
          p.y += p.vy * 0.016
          p.vy += 520 * 0.016
          c.globalAlpha = clamp(p.life * 3, 0, 1)
          c.fillRect(p.x, p.y, 3, 3)
        }
        c.globalAlpha = 1
      }

      // ---- the demand marker ---------------------------------------------
      const demandY = treadY + treadH * (1 - demand)
      const over = demand > grip
      const markerCol = over ? PALETTE.hiVisOrange : TONE.orangeLight
      const pulse = over && !reducedMotion ? 1 + Math.sin(t * 11) * 0.12 : 1

      c.save()
      const barH = (compact ? 5 : 9) * pulse

      // A solid hi-vis bar straight across the tyre — the thing you are asking
      // for, sitting against the thing you have got.
      roundRect(c, bodyX - 3, demandY - barH / 2, bodyW + 6, barH, barH / 2)
      c.fillStyle = markerCol
      c.fill()
      c.lineWidth = compact ? 2 : 3
      c.strokeStyle = TONE.ink
      c.lineJoin = 'round'
      c.stroke()

      // Chevrons either side, pointing at the bar.
      const tip = (compact ? 7 : 12) * pulse
      for (const dir of [-1, 1] as const) {
        const x = dir < 0 ? bodyX - 4 : bodyX + bodyW + 4
        c.beginPath()
        c.moveTo(x + dir * tip * 0.1, demandY)
        c.lineTo(x + dir * tip, demandY - tip * 0.85)
        c.lineTo(x + dir * tip, demandY + tip * 0.85)
        c.closePath()
        c.fillStyle = markerCol
        c.fill()
        c.lineWidth = 2
        c.stroke()
      }
      c.restore()

      // ---- outline last so it sits on top ---------------------------------
      roundRect(c, treadX, treadY, treadW, treadH, compact ? 6 : 10)
      c.lineWidth = compact ? 2 : 3
      c.strokeStyle = TONE.ink
      c.stroke()

      // ---- grown-ups only --------------------------------------------------
      if (showNumbers && numbers) {
        c.font = '600 10px ui-monospace, monospace'
        c.textAlign = 'left'
        const lines = [
          `mu ${numbers.sticky.toFixed(2)}`,
          `N  ${Math.round(numbers.press)}kg`,
          `F  ${Math.round(numbers.grip)}`,
          `D  ${Math.round(numbers.demand)}`,
        ]
        lines.forEach((line, i) => {
          const y = bodyY + 12 + i * 12
          c.fillStyle = 'rgba(0,0,0,0.55)'
          c.fillRect(bodyX + 2, y - 9, 58, 12)
          c.fillStyle = TONE.cream
          c.fillText(line, bodyX + 5, y)
        })
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [snapshotRef, reducedMotion, showNumbers, numbers, compact])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Grip meter: a tyre tread that fills with grit"
    />
  )
}
