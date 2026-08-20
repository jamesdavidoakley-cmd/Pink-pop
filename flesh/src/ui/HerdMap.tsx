import { useEffect, useRef } from 'react'
import { PALETTE } from '@/art/palette'
import { WHOOP } from '@/core/tuning'
import { currentBeacon } from '@/sim/world'
import type { World } from '@/sim/types'
import type { CameraState } from '@/game/CameraRig'

/**
 * The Tab overlay: a top-down map of the drive.
 *
 * It exists because the herd is frequently spread over a hundred metres of
 * badlands and a third-person camera cannot show you all of it. Stragglers are
 * marked in red, which is usually the only reason the player opens this at all.
 */

const SIZE = 520

export function HerdMap({ world, camera }: { world: World; camera: CameraState }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvas.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return

      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (c.width !== SIZE * dpr) {
        c.width = SIZE * dpr
        c.height = SIZE * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, SIZE, SIZE)

      /* View window: centred on the player, wide enough to hold the herd and
         whatever has wandered off it. */
      let span = 120
      for (const a of world.herd) {
        if (a.lost || a.delivered) continue
        span = Math.max(span, Math.hypot(a.pos.x - world.player.pos.x, a.pos.z - world.player.pos.z) * 2.3)
      }
      span = Math.min(span, 420)
      const scale = SIZE / span
      const cx = world.player.pos.x
      const cz = world.player.pos.z
      const px = (x: number) => SIZE / 2 + (x - cx) * scale
      const pz = (z: number) => SIZE / 2 + (z - cz) * scale

      /* ------------------------------------------------------ backdrop */
      ctx.fillStyle = 'rgba(11,7,5,0.88)'
      ctx.fillRect(0, 0, SIZE, SIZE)

      // A hundred-metre grid, so distances can be judged rather than guessed.
      ctx.strokeStyle = 'rgba(232,220,192,0.10)'
      ctx.lineWidth = 1
      const grid = 50
      for (let g = Math.floor((cx - span / 2) / grid) * grid; g < cx + span / 2; g += grid) {
        ctx.beginPath()
        ctx.moveTo(px(g), 0)
        ctx.lineTo(px(g), SIZE)
        ctx.stroke()
      }
      for (let g = Math.floor((cz - span / 2) / grid) * grid; g < cz + span / 2; g += grid) {
        ctx.beginPath()
        ctx.moveTo(0, pz(g))
        ctx.lineTo(SIZE, pz(g))
        ctx.stroke()
      }

      /* --------------------------------------------------------- route */
      const route = world.level.terrain.route
      ctx.strokeStyle = 'rgba(255,210,31,0.35)'
      ctx.lineWidth = 3
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      route.forEach((n, i) => (i === 0 ? ctx.moveTo(px(n.x), pz(n.z)) : ctx.lineTo(px(n.x), pz(n.z))))
      ctx.stroke()
      ctx.setLineDash([])

      route.forEach((n, i) => {
        const active = i === world.beaconIndex
        const final = i === route.length - 1
        ctx.fillStyle = active ? PALETTE.corpYellow : i < world.beaconIndex ? 'rgba(232,220,192,0.3)' : PALETTE.corpWhite
        ctx.beginPath()
        ctx.arc(px(n.x), pz(n.z), final ? 8 : 5, 0, Math.PI * 2)
        ctx.fill()
        if (active) {
          ctx.strokeStyle = PALETTE.corpYellow
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(px(n.x), pz(n.z), 13 + Math.sin(performance.now() / 260) * 3, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      /* -------------------------------------------------------- threats */
      for (const p of world.predators) {
        if (!p.alive) continue
        // A hidden ambusher only shows if the drone has painted it.
        if (p.state === 'HIDDEN' && !world.upgrades.drone) continue
        const asleep = p.state === 'DOWN'
        ctx.fillStyle = asleep ? 'rgba(232,220,192,0.35)' : PALETTE.corpRed
        const size = p.kind === 'oldoneeye' || p.kind === 'bighungry' ? 11 : p.kind === 'raptor' ? 5 : 8
        ctx.beginPath()
        ctx.moveTo(px(p.pos.x), pz(p.pos.z) - size)
        ctx.lineTo(px(p.pos.x) + size, pz(p.pos.z) + size)
        ctx.lineTo(px(p.pos.x) - size, pz(p.pos.z) + size)
        ctx.closePath()
        ctx.fill()
        if (asleep) {
          ctx.fillStyle = PALETTE.corpWhite
          ctx.font = 'bold 11px monospace'
          ctx.fillText('z', px(p.pos.x) + size, pz(p.pos.z) - size)
        }
      }

      /* ----------------------------------------------------------- herd */
      for (const a of world.herd) {
        if (a.lost || a.delivered) continue
        const x = px(a.pos.x)
        const z = pz(a.pos.z)
        if (a.straggler) {
          // "gets a red icon on the minimap" — and a ring, because finding it is
          // the whole reason anyone opens this map.
          ctx.strokeStyle = PALETTE.corpRed
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, z, 10, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.fillStyle = a.straggler
          ? PALETTE.corpRed
          : a.state === 'PANICKED'
            ? '#ff8a3a'
            : a.matriarch
              ? PALETTE.corpYellow
              : a.juvenile
                ? '#cdb98a'
                : PALETTE.corpWhite
        const r = a.matriarch ? 7 : a.juvenile ? 3.5 : 5
        ctx.beginPath()
        ctx.arc(x, z, r, 0, Math.PI * 2)
        ctx.fill()
        if (a.matriarch) {
          ctx.strokeStyle = PALETTE.corpYellow
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(x, z, 12, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      /* --------------------------------------------------------- Reagan */
      const wx = px(world.player.pos.x)
      const wz = pz(world.player.pos.z)
      // The whoop's reach, so you can see who it will actually gather.
      if (world.player.whoopActive > 0) {
        ctx.strokeStyle = 'rgba(242,244,246,0.5)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(wx, wz, WHOOP.radius * scale, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.save()
      ctx.translate(wx, wz)
      ctx.rotate(-camera.yaw)
      ctx.fillStyle = PALETTE.stunBeam
      ctx.beginPath()
      ctx.moveTo(0, -11)
      ctx.lineTo(7, 8)
      ctx.lineTo(0, 4)
      ctx.lineTo(-7, 8)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [world, camera])

  const beacon = currentBeacon(world)
  const stragglers = world.herd.filter((a) => a.straggler && !a.lost && !a.delivered).length

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/70 backdrop-blur-[2px]">
      <div className="panel p-4">
        <div className="mb-2 flex items-baseline justify-between gap-8">
          <span className="masthead text-sm tracking-[0.24em]">HERD MAP</span>
          <span className="text-xs tracking-[0.2em] opacity-75">{beacon?.label ?? 'GATE'}</span>
        </div>
        <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} className="border-2 border-paper/60" />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] opacity-80">
          <Key colour={PALETTE.corpYellow} label="Matriarch" />
          <Key colour={PALETTE.corpWhite} label="Head" />
          <Key colour={PALETTE.corpRed} label="Straggler / threat" />
          <Key colour={PALETTE.stunBeam} label="You" />
          <span className="ml-auto">
            {stragglers > 0 ? (
              <span className="text-corp-red">
                {stragglers} adrift — lost at the next marker
              </span>
            ) : (
              <span className="opacity-60">Herd together</span>
            )}
          </span>
        </div>
        <div className="mt-1 text-center text-[10px] tracking-[0.2em] opacity-50">TAB TO CLOSE</div>
      </div>
    </div>
  )
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  )
}
