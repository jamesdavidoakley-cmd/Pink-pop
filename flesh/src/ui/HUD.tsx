import { useEffect, useRef } from 'react'
import { HERD, PLAYER, RIFLE, WHOOP } from '@/core/tuning'
import { angleDelta, clamp, dist2, headingOf } from '@/core/math'
import { MOOD_COLOUR } from '@/art/palette'
import { closeoutProgress, currentBeacon, gateLocked, isFinalBeacon } from '@/sim/world'
import { canMountBike, maxStamina } from '@/sim/player'
import type { CameraState } from '@/game/CameraRig'
import type { World } from '@/sim/types'
import { useGame } from '@/state/store'

/**
 * The HUD.
 *
 * Corners only, never the middle — the middle is where the herd is, and this
 * game is about watching the herd. Everything here is written straight to the
 * DOM on an animation frame rather than through React state: at sixty frames a
 * second a re-render per tick would cost more than the entire simulation does.
 */

const EDGE_WARN_RANGE = 30

export function HUD({ world, camera }: { world: World; camera: CameraState }) {
  const headRef = useRef<HTMLDivElement>(null)
  const headIcons = useRef<HTMLDivElement>(null)
  const calmBar = useRef<HTMLDivElement>(null)
  const calmLabel = useRef<HTMLDivElement>(null)
  const staminaBar = useRef<HTMLDivElement>(null)
  const pips = useRef<HTMLDivElement>(null)
  const compass = useRef<HTMLDivElement>(null)
  const compassText = useRef<HTMLDivElement>(null)
  const beaconName = useRef<HTMLDivElement>(null)
  const creditsRef = useRef<HTMLDivElement>(null)
  const crosshair = useRef<HTMLDivElement>(null)
  const edges = useRef<HTMLDivElement>(null)
  const goadRef = useRef<HTMLDivElement>(null)
  const whoopRef = useRef<HTMLDivElement>(null)
  const netRef = useRef<HTMLDivElement>(null)
  const boomerRef = useRef<HTMLDivElement>(null)
  const bossRef = useRef<HTMLDivElement>(null)
  const closeout = useRef<HTMLDivElement>(null)
  const gateWarn = useRef<HTMLDivElement>(null)
  const bikePrompt = useRef<HTMLDivElement>(null)

  const upgrades = world.upgrades

  useEffect(() => {
    let raf = 0
    let lastHead = -1
    let lastAmmo = -1

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const alive = world.herd.filter((a) => !a.lost).length
      const total = world.stats.headStart

      /* ------------------------------------------------ head count */
      if (alive !== lastHead) {
        lastHead = alive
        if (headRef.current) headRef.current.textContent = `${alive} / ${total}`
        const icons = headIcons.current
        if (icons) {
          // Delivered head are solid, still-on-the-drive are outlined, lost
          // ones stay as ghosts so the count you failed to make is visible.
          icons.innerHTML = world.herd
            .map((a) => {
              const cls = a.lost
                ? 'opacity-25 line-through'
                : a.delivered
                  ? 'text-corp-yellow'
                  : 'text-paper'
              return `<span class="${cls}">${a.matriarch ? '◆' : a.juvenile ? '▪' : '■'}</span>`
            })
            .join('')
        }
      }

      /* ------------------------------------------------- herd calm */
      const calm = world.herdCalmAverage
      if (calmBar.current) {
        calmBar.current.style.width = `${clamp(calm, 0, 100)}%`
        calmBar.current.style.background = MOOD_COLOUR[world.mood]
      }
      if (calmLabel.current && calmLabel.current.textContent !== world.mood) {
        calmLabel.current.textContent = world.mood
        calmLabel.current.style.color = MOOD_COLOUR[world.mood]
      }

      /* --------------------------------------------------- stamina */
      if (staminaBar.current) {
        staminaBar.current.style.width = `${(world.player.stamina / maxStamina(world)) * 100}%`
        staminaBar.current.style.opacity = world.player.stamina < maxStamina(world) - 0.5 ? '1' : '0.3'
      }

      /* ----------------------------------------- rifle charge pips */
      if (world.player.ammo !== lastAmmo && pips.current) {
        lastAmmo = world.player.ammo
        const children = pips.current.children
        for (let i = 0; i < children.length; i++) {
          const el = children[i] as HTMLElement
          el.style.background = i < world.player.ammo ? 'var(--color-corp-yellow)' : 'transparent'
        }
      }

      /* -------------------------------------- compass to the beacon */
      const beacon = currentBeacon(world)
      if (beacon) {
        const d = Math.hypot(beacon.x - world.player.pos.x, beacon.z - world.player.pos.z)
        const bearing = headingOf(beacon.x - world.player.pos.x, beacon.z - world.player.pos.z)
        // Relative to where the camera is looking, which is where the player
        // believes "forward" is.
        const rel = angleDelta(camera.yaw, bearing)
        if (compass.current) compass.current.style.transform = `rotate(${-rel}rad)`
        if (compassText.current) compassText.current.textContent = `${Math.round(d)}m`
        if (beaconName.current && beaconName.current.textContent !== beacon.label) {
          beaconName.current.textContent = beacon.label
        }
      }

      /* --------------------------------------------------- credits */
      if (creditsRef.current) {
        // The running total is worth showing live: it is the only feedback that
        // says a quiet, uneventful drive is going well.
        const running =
          world.stats.headDelivered * 100 + world.stats.headPrime * 50
        creditsRef.current.textContent = `${running.toLocaleString('en-GB')} FC`
      }

      /* ------------------------------------------------- crosshair */
      if (crosshair.current) crosshair.current.style.opacity = world.player.aiming ? '1' : '0'

      /* --------------------------------------------------cooldowns */
      setCooldown(goadRef.current, world.player.goadTimer, 0.55)
      setCooldown(whoopRef.current, world.player.whoopTimer, WHOOP.cooldown)
      setCooldown(netRef.current, world.player.netTimer, 40)
      setCooldown(boomerRef.current, world.player.boomerTimer, 26)

      /* -------------------------------- off-screen threat indicators */
      if (edges.current) {
        const marks: string[] = []
        for (const p of world.predators) {
          if (!p.alive || p.state === 'DOWN' || p.state === 'HIDDEN') continue
          const d = dist2(p.pos, world.player.pos)
          const marked = upgrades.drone
          if (d > (marked ? EDGE_WARN_RANGE * 2.5 : EDGE_WARN_RANGE)) continue
          const bearing = headingOf(p.pos.x - world.player.pos.x, p.pos.z - world.player.pos.z)
          const rel = angleDelta(camera.yaw, bearing)
          // Roughly the horizontal half-angle of the chase camera's frustum.
          if (Math.abs(rel) < 0.72) continue
          const side = rel > 0 ? 'right' : 'left'
          const vertical = 50 + Math.sin(rel) * 22
          const intensity = clamp(1 - d / EDGE_WARN_RANGE, 0.25, 1)
          marks.push(
            `<div style="position:absolute;${side}:0;top:${vertical}%;width:26px;height:110px;` +
              `transform:translateY(-50%);opacity:${intensity};` +
              `background:linear-gradient(to ${side === 'left' ? 'right' : 'left'}, var(--color-corp-red), transparent)"></div>`,
          )
        }
        edges.current.innerHTML = marks.join('')
      }

      /* --------------------------------------------- the hover bike */
      if (bikePrompt.current) {
        bikePrompt.current.style.display = canMountBike(world) ? 'block' : 'none'
      }

      /* ---------------------------------------------- boss progress */
      const boss = world.predators.find((p) => p.kind === 'oldoneeye' || p.kind === 'bighungry')
      if (bossRef.current) {
        if (boss && boss.alive) {
          bossRef.current.style.display = 'block'
          const name = boss.kind === 'oldoneeye' ? 'OLD ONE EYE' : 'BIG HUNGRY'
          const pipsOut = [0, 1, 2]
            .map(
              (i) =>
                `<span style="display:inline-block;width:26px;height:12px;margin-right:4px;border:2px solid var(--color-paper);background:${
                  i < boss.staggers ? 'var(--color-corp-red)' : 'transparent'
                }"></span>`,
            )
            .join('')
          bossRef.current.innerHTML =
            `<div class="text-xs tracking-[0.3em] mb-1">${name}</div><div>${pipsOut}</div>`
        } else {
          bossRef.current.style.display = 'none'
        }
      }

      /* ------------------------------------------------- the gate */
      const locked = gateLocked(world)
      if (gateWarn.current) {
        gateWarn.current.style.display = locked && isFinalBeacon(world) ? 'block' : 'none'
      }
      if (closeout.current) {
        const progress = closeoutProgress(world)
        closeout.current.style.display = progress > 0.02 ? 'block' : 'none'
        const fill = closeout.current.querySelector('i') as HTMLElement | null
        if (fill) fill.style.width = `${progress * 100}%`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world, camera, upgrades])

  return (
    <div className="pointer-events-none absolute inset-0 select-none text-paper">
      {/* ------------------------------------------------------ top left */}
      <div className="absolute left-4 top-4 w-64">
        <div className="hud-shadow flex items-baseline gap-2">
          <span className="text-xs tracking-[0.32em] opacity-70">HEAD</span>
          <div ref={headRef} className="text-3xl font-bold leading-none">
            — / —
          </div>
        </div>
        <div ref={headIcons} className="mt-1 flex gap-[3px] text-sm leading-none" />

        <div className="mt-3">
          <div className="hud-shadow flex justify-between text-[10px] tracking-[0.28em] opacity-80">
            <span>HERD</span>
            <div ref={calmLabel}>GRAZING</div>
          </div>
          <div className="mt-1 h-3 border-2 border-paper/80 bg-ink/60">
            <div ref={calmBar} className="h-full transition-[width] duration-150" style={{ width: '100%' }} />
          </div>
          <div className="mt-1 h-1.5 border border-paper/40 bg-ink/60">
            <div ref={staminaBar} className="h-full bg-corp-blue" style={{ width: '100%' }} />
          </div>
        </div>

        <div ref={bossRef} className="panel mt-3 p-2" style={{ display: 'none' }} />
      </div>

      {/* ----------------------------------------------------- top right */}
      <div className="absolute right-4 top-4 text-right">
        <div className="hud-shadow text-[10px] tracking-[0.32em] opacity-70">THIS DRIVE</div>
        <div ref={creditsRef} className="hud-shadow text-2xl font-bold leading-none text-corp-yellow">
          0 FC
        </div>
      </div>

      {/* --------------------------------------------------- bottom left */}
      <div className="absolute bottom-4 left-4">
        <div className="hud-shadow mb-1 text-[10px] tracking-[0.32em] opacity-70">STUN CHARGE</div>
        <div ref={pips} className="flex gap-1">
          {Array.from({ length: RIFLE.magazine }).map((_, i) => (
            <span key={i} className="h-4 w-3 border-2 border-paper/85 bg-corp-yellow" />
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Cooldown label="E" name="GOAD" innerRef={goadRef} />
          <Cooldown label="Q" name="WHOOP" innerRef={whoopRef} />
          {upgrades.netGun && <Cooldown label="R" name="NET" innerRef={netRef} />}
          {upgrades.sonicBoomer && <Cooldown label="C" name="BOOM" innerRef={boomerRef} />}
        </div>
      </div>

      {/* -------------------------------------------------- bottom right */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3">
        <div className="text-right">
          <div ref={beaconName} className="hud-shadow text-[10px] tracking-[0.26em] opacity-75">
            —
          </div>
          <div ref={compassText} className="hud-shadow text-2xl font-bold leading-none">
            0m
          </div>
        </div>
        <div className="relative h-14 w-14 rounded-full border-2 border-paper/80">
          <div ref={compass} className="absolute inset-0 flex items-start justify-center">
            <span className="mt-0.5 text-2xl leading-none text-corp-yellow">▲</span>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- the middle */}
      <div ref={crosshair} className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-100">
        <svg width="44" height="44" viewBox="0 0 44 44" className="drop-shadow-[2px_2px_0_rgba(11,7,5,0.9)]">
          <circle cx="22" cy="22" r="9" fill="none" stroke="#f2f4f6" strokeWidth="1.5" opacity="0.85" />
          <path d="M22 2v9M22 33v9M2 22h9M33 22h9" stroke="#ffd21f" strokeWidth="2.5" />
          <circle cx="22" cy="22" r="1.6" fill="#ffd21f" />
        </svg>
      </div>

      {/* Directional threat marks. This matters more than usual here, because
          the job forces you to look away from the thing hunting you. */}
      <div ref={edges} className="absolute inset-0" />

      <div
        ref={bikePrompt}
        className="absolute bottom-40 left-1/2 -translate-x-1/2 text-center"
        style={{ display: 'none' }}
      >
        <div className="panel px-3 py-1.5 text-xs tracking-[0.22em]">
          <span className="text-corp-yellow">F</span> — TAKE THE BIKE
        </div>
      </div>

      <div ref={gateWarn} className="absolute left-1/2 top-24 -translate-x-1/2 text-center" style={{ display: 'none' }}>
        <div className="panel border-corp-red px-4 py-2 text-sm tracking-[0.22em] text-corp-red">
          FENCE HOT — GATE SHUT
        </div>
      </div>

      <div
        ref={closeout}
        className="absolute bottom-28 left-1/2 w-72 -translate-x-1/2 text-center"
        style={{ display: 'none' }}
      >
        <div className="hud-shadow mb-1 text-[10px] tracking-[0.24em]">CLOSING OUT THE DRIVE</div>
        <div className="h-2.5 border-2 border-paper/80 bg-ink/70">
          <i className="block h-full bg-corp-yellow" style={{ width: '0%' }} />
        </div>
        <div className="mt-1 text-[10px] opacity-70">Anything still out there gets written off.</div>
      </div>

      <Toasts />
    </div>
  )
}

function Cooldown({
  label,
  name,
  innerRef,
}: {
  label: string
  name: string
  innerRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="relative h-9 w-14 overflow-hidden border-2 border-paper/80 bg-ink/60 text-center">
      <div ref={innerRef} className="absolute bottom-0 left-0 w-full bg-paper/25" style={{ height: '0%' }} />
      <div className="relative">
        <div className="text-xs font-bold leading-4">{label}</div>
        <div className="text-[8px] tracking-[0.18em] opacity-70">{name}</div>
      </div>
    </div>
  )
}

function setCooldown(el: HTMLDivElement | null, remaining: number, total: number): void {
  if (!el) return
  el.style.height = `${clamp((remaining / total) * 100, 0, 100)}%`
}

/* ---------------------------------------------------------------- toasts */

/**
 * Trans-Time's announcements and Reagan's asides. Low in the frame, brief, and
 * never in the way of the herd.
 */
function Toasts() {
  const toasts = useGame((s) => s.toasts)
  const expire = useGame((s) => s.expireToasts)

  useEffect(() => {
    const id = setInterval(() => expire(performance.now()), 500)
    return () => clearInterval(id)
  }, [expire])

  return (
    <div className="absolute bottom-24 left-1/2 w-[min(34rem,80vw)] -translate-x-1/2 space-y-1 text-center">
      {toasts.map((t) => (
        <div key={t.id} className="panel px-3 py-1.5 text-sm hud-shadow">
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Exported for the map overlay, which needs the same straggler test. */
export const isStraggler = (world: World, id: number): boolean => {
  const a = world.herd.find((h) => h.id === id)
  return !!a && a.straggler
}

export const HUD_CONSTANTS = { EDGE_WARN_RANGE, PLAYER, HERD }
