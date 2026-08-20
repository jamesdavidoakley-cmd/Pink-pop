/**
 * §16: "Head count, credits and upgrades survive a page refresh."
 *
 * A refresh is just a fresh read of localStorage, so that is what these test:
 * write a profile, throw the object away, read it back through the same code
 * path the game boots with.
 */

import { describe, expect, it } from 'vitest'
import {
  SAVE_KEY,
  clearSave,
  defaultSave,
  loadSave,
  migrate,
  recordDrive,
  writeSave,
  type StorageLike,
} from '@/state/save'

function fakeStorage(): StorageLike & { raw: Map<string, string> } {
  const raw = new Map<string, string>()
  return {
    raw,
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => void raw.set(k, v),
    removeItem: (k) => void raw.delete(k),
  }
}

describe('the save', () => {
  it('round-trips credits, upgrades and the log across a reload', () => {
    const store = fakeStorage()
    let save = defaultSave()
    save = recordDrive(save, 'fern-flats', 1, {
      credits: 1450,
      headDelivered: 11,
      headLost: 1,
      time: 296,
      passed: true,
    })
    save.upgrades.netGun = true
    save.upgrades.stamina = 2
    save.hat = 'stetson'
    writeSave(save, store)

    // The page reloads: nothing survives but the string in storage.
    const reloaded = loadSave(store)

    expect(reloaded.credits).toBe(1450)
    expect(reloaded.upgrades.netGun).toBe(true)
    expect(reloaded.upgrades.stamina).toBe(2)
    expect(reloaded.hat).toBe('stetson')
    expect(reloaded.log.totalHeadDelivered).toBe(11)
    expect(reloaded.log.totalHeadLost).toBe(1)
    expect(reloaded.log.levels['fern-flats']?.bestHead).toBe(11)
    expect(reloaded.log.levels['fern-flats']?.bestTime).toBe(296)
    expect(reloaded.levelsUnlocked).toBe(3)
  })

  it('uses exactly one key, named flesh_save', () => {
    const store = fakeStorage()
    writeSave(defaultSave(), store)
    expect([...store.raw.keys()]).toEqual([SAVE_KEY])
  })

  it('keeps the best run per level rather than the last', () => {
    let save = defaultSave()
    const drive = (credits: number, head: number, time: number) =>
      recordDrive(save, 'bone-gulch', 2, {
        credits,
        headDelivered: head,
        headLost: 0,
        time,
        passed: true,
      })
    save = drive(1800, 11, 300)
    save = drive(900, 6, 240)

    const rec = save.log.levels['bone-gulch']!
    expect(rec.bestCredits).toBe(1800)
    expect(rec.bestHead).toBe(11)
    expect(rec.bestTime).toBe(240) // faster run still counts
    expect(rec.attempts).toBe(2)
    // Credits are cumulative earnings, not a best-of.
    expect(save.credits).toBe(2700)
  })

  it('never re-locks a level after a failed replay', () => {
    let save = defaultSave()
    save = recordDrive(save, 'carver-gates', 0, {
      credits: 900,
      headDelivered: 6,
      headLost: 0,
      time: 200,
      passed: true,
    })
    expect(save.levelsUnlocked).toBe(2)
    save = recordDrive(save, 'carver-gates', 0, {
      credits: 200,
      headDelivered: 2,
      headLost: 4,
      time: 400,
      passed: false,
    })
    expect(save.levelsUnlocked).toBe(2)
    expect(save.log.levels['carver-gates']!.completed).toBe(true)
  })

  it('degrades a corrupt or ancient save to a fresh profile instead of throwing', () => {
    const store = fakeStorage()
    store.setItem(SAVE_KEY, '{"credits": "lots", not json')
    expect(() => loadSave(store)).not.toThrow()
    expect(loadSave(store).credits).toBe(0)

    expect(migrate({ credits: 'many', difficulty: 'impossible', upgrades: null }).credits).toBe(0)
    expect(migrate({ credits: 'many', difficulty: 'impossible' }).difficulty).toBe('trailboss')
    expect(migrate(null).levelsUnlocked).toBe(1)
    expect(migrate({ credits: -50 }).credits).toBe(0)
  })

  it('plays on with storage unavailable', () => {
    expect(() => writeSave(defaultSave(), null)).not.toThrow()
    expect(loadSave(null).credits).toBe(0)
    expect(() => clearSave(null)).not.toThrow()
  })
})
