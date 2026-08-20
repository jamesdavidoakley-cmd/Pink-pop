import { useEffect, useRef, useState } from 'react'
import type { InputManager } from '@/core/input'

/**
 * A stick and two buttons for touch devices.
 *
 * The brief asks for these "if trivial", so this is the trivial version: a
 * thumb stick that writes straight into the input manager, a fire button and an
 * aim toggle. Desktop never sees any of it.
 */

export function TouchControls({ input, active }: { input: InputManager; active: boolean }) {
  const [isTouch, setIsTouch] = useState(false)
  const stick = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const origin = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setIsTouch(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    if (!isTouch || !active) return
    const el = stick.current
    if (!el) return

    const radius = 56
    const onStart = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      const rect = el.getBoundingClientRect()
      origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      input.touchStick.active = true
    }
    const onMove = (e: PointerEvent) => {
      if (!input.touchStick.active) return
      const dx = e.clientX - origin.current.x
      const dy = e.clientY - origin.current.y
      const len = Math.hypot(dx, dy) || 1
      const clamped = Math.min(len, radius)
      input.touchStick.x = (dx / len) * (clamped / radius)
      input.touchStick.y = (dy / len) * (clamped / radius)
      if (knob.current) {
        knob.current.style.transform = `translate(${(dx / len) * clamped}px, ${(dy / len) * clamped}px)`
      }
    }
    const onEnd = () => {
      input.touchStick.active = false
      input.touchStick.x = 0
      input.touchStick.y = 0
      if (knob.current) knob.current.style.transform = 'translate(0,0)'
    }

    el.addEventListener('pointerdown', onStart)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onEnd)
    el.addEventListener('pointercancel', onEnd)
    return () => {
      el.removeEventListener('pointerdown', onStart)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onEnd)
      el.removeEventListener('pointercancel', onEnd)
      onEnd()
    }
  }, [isTouch, active, input])

  if (!isTouch || !active) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div
        ref={stick}
        className="pointer-events-auto absolute bottom-8 left-8 flex h-32 w-32 items-center justify-center rounded-full border-2 border-paper/40 bg-ink/40"
      >
        <div ref={knob} className="h-14 w-14 rounded-full border-2 border-paper/70 bg-paper/25" />
      </div>

      <div className="pointer-events-auto absolute bottom-10 right-8 flex flex-col items-end gap-3">
        <TouchButton label="AIM" onDown={() => (input.touchAim = true)} onUp={() => (input.touchAim = false)} />
        <div className="flex gap-3">
          <TouchButton label="Q" small onDown={() => input.pressVirtual('whoop')} onUp={() => {}} />
          <TouchButton label="E" small onDown={() => input.pressVirtual('goad')} onUp={() => {}} />
          <TouchButton label="FIRE" onDown={() => (input.touchFire = true)} onUp={() => (input.touchFire = false)} />
        </div>
      </div>
    </div>
  )
}

function TouchButton({
  label,
  onDown,
  onUp,
  small,
}: {
  label: string
  onDown: () => void
  onUp: () => void
  small?: boolean
}) {
  return (
    <button
      className={`rounded-full border-2 border-paper/60 bg-ink/50 font-bold tracking-[0.12em] text-paper/90 active:bg-paper/30 ${
        small ? 'h-14 w-14 text-sm' : 'h-20 w-20 text-xs'
      }`}
      onPointerDown={(e) => {
        e.preventDefault()
        onDown()
      }}
      onPointerUp={(e) => {
        e.preventDefault()
        onUp()
      }}
      onPointerLeave={onUp}
    >
      {label}
    </button>
  )
}
