/**
 * One small store for the whole game: which profile is playing, what they own,
 * and which screen is up. Saved to local storage on every change.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadSave, newProfile, writeSave, type Profile, type SaveFile, type ConceptId } from './save'
import { prefersReducedMotion, setNarrationEnabled } from '../a11y/narration'
import { audio } from '../audio/engine'
import type { Zone } from '../physics/constants'
import type { XpAward } from '../game/xp'

export type Screen =
  | { k: 'profiles' }
  | { k: 'yard' }
  | { k: 'shop' }
  | { k: 'grownup' }
  | { k: 'loadbay'; levelId: string; runIndex: number; carried: XpAward[] }
  | { k: 'predict'; levelId: string; runIndex: number; carried: XpAward[]; placement: Record<string, Zone> }
  | {
      k: 'drive'
      levelId: string
      runIndex: number
      carried: XpAward[]
      placement: Record<string, Zone>
      /** Whether the thumbs-up/down on the predict card turned out to be right. */
      predictionCorrect: boolean | null
    }
  | { k: 'results'; levelId: string; awards: XpAward[]; succeeded: boolean; nextRun: number | null }

interface GameContextValue {
  save: SaveFile
  slot: 0 | 1 | null
  profile: Profile | null
  screen: Screen
  reducedMotion: boolean
  go: (screen: Screen) => void
  chooseProfile: (slot: 0 | 1) => void
  signOut: () => void
  update: (fn: (profile: Profile) => Profile) => void
  resetProfile: (slot: 0 | 1) => void
  addMastery: (concept: ConceptId, amount?: number) => void
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<SaveFile>(() => loadSave())
  const [slot, setSlot] = useState<0 | 1 | null>(null)
  const [screen, setScreen] = useState<Screen>({ k: 'profiles' })
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setSystemReducedMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    writeSave(save)
  }, [save])

  const profile = slot === null ? null : save.profiles[slot]

  useEffect(() => {
    if (!profile) return
    setNarrationEnabled(profile.settings.narration)
    audio.setEnabled(profile.settings.sound)
  }, [profile?.settings.narration, profile?.settings.sound, profile])

  const update = useCallback(
    (fn: (profile: Profile) => Profile) => {
      setSave((current) => {
        if (slot === null) return current
        const next: SaveFile = {
          ...current,
          profiles: [...current.profiles] as [Profile, Profile],
          lastSlot: slot,
        }
        next.profiles[slot] = fn(current.profiles[slot])
        return next
      })
    },
    [slot],
  )

  const chooseProfile = useCallback((which: 0 | 1) => {
    setSlot(which)
    setSave((current) => {
      const next: SaveFile = {
        ...current,
        profiles: [...current.profiles] as [Profile, Profile],
        lastSlot: which,
      }
      if (!next.profiles[which].created) {
        next.profiles[which] = { ...next.profiles[which], created: true }
      }
      return next
    })
    setScreen({ k: 'yard' })
  }, [])

  const signOut = useCallback(() => {
    setSlot(null)
    setScreen({ k: 'profiles' })
  }, [])

  const resetProfile = useCallback((which: 0 | 1) => {
    setSave((current) => {
      const next: SaveFile = {
        ...current,
        profiles: [...current.profiles] as [Profile, Profile],
      }
      next.profiles[which] = newProfile(which)
      return next
    })
  }, [])

  const addMastery = useCallback(
    (concept: ConceptId, amount = 1) => {
      update((p) => ({ ...p, mastery: { ...p.mastery, [concept]: (p.mastery[concept] ?? 0) + amount } }))
    },
    [update],
  )

  const reducedMotion = systemReducedMotion || (profile?.settings.reducedMotion ?? false)

  const value = useMemo<GameContextValue>(
    () => ({
      save,
      slot,
      profile,
      screen,
      reducedMotion,
      go: setScreen,
      chooseProfile,
      signOut,
      update,
      resetProfile,
      addMastery,
    }),
    [save, slot, profile, screen, reducedMotion, chooseProfile, signOut, update, resetProfile, addMastery],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame must be used inside a GameProvider')
  return context
}

/** The profile, guaranteed present — only call inside the signed-in screens. */
export function usePlayer(): { profile: Profile; update: (fn: (p: Profile) => Profile) => void } {
  const { profile, update } = useGame()
  if (!profile) throw new Error('No profile chosen')
  return { profile, update }
}
