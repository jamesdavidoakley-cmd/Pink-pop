/**
 * The shell furniture: big painted wooden buttons, panels and the little
 * pictures that stand in for numbers.
 *
 * Everything tappable is at least 64px, because it is going to be hit by a
 * thumb, at speed, at an angle, by someone who is six.
 */

import type { ReactNode } from 'react'
import { audio } from '../audio/engine'
import { speak } from '../a11y/narration'
import { SURFACE_NAME, SURFACE_STICKY_PIPS } from '../theme'
import type { SurfaceId } from '../physics/constants'
import { Icon, type IconName } from './Icon'

type Tone = 'green' | 'orange' | 'slate' | 'cream'

const TONES: Record<Tone, string> = {
  green: 'bg-haulage text-cream',
  orange: 'bg-hivis text-slate-deep',
  slate: 'bg-slate-soft text-cream',
  cream: 'bg-card text-slate-deep',
}

interface BigButtonProps {
  onClick?: () => void
  children?: ReactNode
  tone?: Tone
  icon?: IconName
  className?: string
  disabled?: boolean
  /** Spoken when tapped, so the button explains itself. */
  say?: string
  label?: string
  ariaLabel?: string
}

export function BigButton({
  onClick,
  children,
  tone = 'green',
  icon,
  className = '',
  disabled,
  say,
  label,
  ariaLabel,
}: BigButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      onClick={() => {
        if (disabled) return
        audio.start()
        audio.tap()
        if (say) speak(say, { force: true })
        onClick?.()
      }}
      className={`toy toy-press signwritten-centred min-h-16 rounded-2xl px-5 py-3 text-2xl leading-none disabled:opacity-45 ${TONES[tone]} ${className}`}
    >
      <span className="flex items-center justify-center gap-3">
        {icon ? <Icon name={icon} className="h-8 w-8 shrink-0" /> : null}
        {label ? <span>{label}</span> : null}
        {children}
      </span>
    </button>
  )
}

export function Panel({
  children,
  className = '',
  tone = 'card',
}: {
  children: ReactNode
  className?: string
  tone?: 'card' | 'paper' | 'slate'
}) {
  const tones = {
    card: 'bg-card',
    paper: 'bg-paper',
    slate: 'bg-slate-wet text-cream',
  }
  return <div className={`toy brushed rounded-3xl ${tones[tone]} ${className}`}>{children}</div>
}

/** Weight as a row of chunky blocks, never as a number. */
export function WeightPips({ mass, className = '' }: { mass: number; className?: string }) {
  const pips = Math.max(1, Math.min(8, Math.round(mass / 450)))
  return (
    <span className={`inline-flex items-end gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: pips }, (_, i) => (
        <span
          key={i}
          className="w-[7px] rounded-[2px] border-2 border-slate-deep bg-slate-soft"
          style={{ height: 8 + (i % 3) * 4 }}
        />
      ))}
    </span>
  )
}

/** How sticky a surface is, as a row of grip dots. */
export function StickyPips({ surface, className = '' }: { surface: SurfaceId; className?: string }) {
  const pips = SURFACE_STICKY_PIPS[surface]
  return (
    <span className={`inline-flex gap-1 ${className}`} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full border-2 border-slate-deep ${
            i < pips ? 'bg-hivis' : 'bg-grit-dark/40'
          }`}
        />
      ))}
    </span>
  )
}

export function SurfaceChip({ surface }: { surface: SurfaceId }) {
  const swatch: Record<SurfaceId, string> = {
    dry_tarmac: '#4A5462',
    wet_tarmac: '#3B4552',
    gravel: '#B4AC9C',
    wet_leaves: '#6E5A32',
    mud: '#8A5A2B',
    snow: '#EDF2F4',
    ice: '#BFE3EF',
  }
  return (
    <span className="toy-sm inline-flex items-center gap-2 rounded-xl bg-card px-3 py-2">
      <span
        className="h-7 w-7 rounded-md border-[3px] border-slate-deep"
        style={{ background: swatch[surface] }}
        aria-hidden
      />
      <span className="signwritten-centred text-lg text-slate-deep">{SURFACE_NAME[surface]}</span>
      <StickyPips surface={surface} />
    </span>
  )
}

/** The "press on the driving wheels" bar. Fills as cargo moves rearward. */
export function PressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={className}>
      <div className="signwritten mb-1 text-lg text-slate-deep">Press on the driving wheels</div>
      <div className="toy-sm relative h-10 overflow-hidden rounded-xl bg-slate-deep">
        <div
          className="absolute inset-y-0 left-0 bg-hivis transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
        {/* Arrows pressing down, so the bar reads as weight not as a score. */}
        <div className="absolute inset-0 flex items-center justify-around px-2" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              className="text-xl leading-none"
              style={{ color: pct > (i + 0.5) * 14.3 ? '#1B222B' : '#4A5462' }}
            >
              ▼
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function XpBadge({ xp }: { xp: number }) {
  return (
    <span className="toy-sm inline-flex items-center gap-2 rounded-full bg-hivis px-4 py-2 text-slate-deep">
      <Icon name="star" className="h-6 w-6" />
      <span className="signwritten-centred text-2xl leading-none">{xp}</span>
    </span>
  )
}

/** A landscape nudge. Portrait is playable but the game is built for landscape. */
export function RotateNudge() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-2 z-50 flex justify-center portrait:flex landscape:hidden">
      <div className="toy-sm animate-bob rounded-2xl bg-hivis px-4 py-2">
        <span className="signwritten-centred text-lg text-slate-deep">Turn the tablet sideways</span>
      </div>
    </div>
  )
}
