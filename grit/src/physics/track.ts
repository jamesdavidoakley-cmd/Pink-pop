/**
 * A track is just a list of stretches of road. Each stretch has one surface,
 * one gradient and optionally a bend. Levels are built out of these and nothing
 * else, which keeps "one new idea per level" easy to honour.
 */

import type { SurfaceId } from './constants'

export interface TrackSegment {
  /** Metres. */
  length: number
  surface: SurfaceId
  /** Radians. Positive climbs. */
  grade: number
  /** Metres. Smaller is tighter. null or omitted is a straight. */
  bendRadius?: number | null
  /** Which way the bend goes, for the artwork. */
  bendDir?: -1 | 1
}

export interface Track {
  segments: TrackSegment[]
}

/** Bosses paint fresh surfaces onto the road while you are driving on it. */
export interface SurfacePatch {
  from: number
  to: number
  surface: SurfaceId
}

export const trackLength = (track: Track): number =>
  track.segments.reduce((sum, seg) => sum + seg.length, 0)

export interface SampledPoint {
  surface: SurfaceId
  slope: number
  bendRadius: number | null
  bendDir: -1 | 1
  segmentIndex: number
}

export function sampleTrack(track: Track, s: number, patches: SurfacePatch[] = []): SampledPoint {
  let acc = 0
  let index = 0
  let seg = track.segments[0]
  for (let i = 0; i < track.segments.length; i++) {
    const candidate = track.segments[i]!
    if (s < acc + candidate.length || i === track.segments.length - 1) {
      seg = candidate
      index = i
      break
    }
    acc += candidate.length
  }
  if (!seg) {
    return { surface: 'dry_tarmac', slope: 0, bendRadius: null, bendDir: 1, segmentIndex: 0 }
  }

  let surface = seg.surface
  // Later patches win, so a boss can freeze a stretch twice over.
  for (const patch of patches) {
    if (s >= patch.from && s <= patch.to) surface = patch.surface
  }

  return {
    surface,
    slope: seg.grade,
    bendRadius: seg.bendRadius ?? null,
    bendDir: seg.bendDir ?? 1,
    segmentIndex: index,
  }
}

/** Height of the road at distance s, for drawing the hills. */
export function elevationAt(track: Track, s: number): number {
  let acc = 0
  let y = 0
  for (const seg of track.segments) {
    const within = Math.min(Math.max(s - acc, 0), seg.length)
    y += Math.sin(seg.grade) * within
    acc += seg.length
    if (s <= acc) break
  }
  if (s > acc) {
    const last = track.segments[track.segments.length - 1]
    if (last) y += Math.sin(last.grade) * (s - acc)
  }
  return y
}

/** Every surface the player will meet on this track, in the order they meet it. */
export function surfacesOf(track: Track): SurfaceId[] {
  const seen: SurfaceId[] = []
  for (const seg of track.segments) {
    if (!seen.includes(seg.surface)) seen.push(seg.surface)
  }
  return seen
}
