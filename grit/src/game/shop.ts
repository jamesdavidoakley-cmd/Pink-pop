/**
 * The shop.
 *
 * Every kit item changes the sums in `physics/model.ts` and every one of them
 * costs you something as well as giving you something. There is no item here
 * that is simply "+10% grip", because that would teach that grip is a number
 * you buy rather than a thing you arrange.
 *
 * The fun half is pure spending money, so that XP is not only homework.
 */

import type { SurfaceId } from '../physics/constants'

export type ItemKind = 'kit' | 'paint' | 'horn' | 'hat' | 'extra'

export interface ShopItem {
  id: string
  name: string
  price: number
  kind: ItemKind
  /** Spoken aloud on the shop shelf. Child vocabulary only. */
  spoken: string
  /** Shown as two short lines under the icon. */
  gives: string
  costs: string
  /** Surfaces where this item is the obvious answer, for the shop hint. */
  bestOn?: SurfaceId[]
}

export const SHOP: ShopItem[] = [
  {
    id: 'knobbly',
    name: 'Knobbly tyres',
    price: 150,
    kind: 'kit',
    spoken: 'Knobbly tyres. Brilliant in mud and gravel. A bit slippy on a dry road.',
    gives: 'Bites in mud',
    costs: 'Slippier on dry roads',
    bestOn: ['mud', 'gravel'],
  },
  {
    id: 'chains',
    name: 'Snow chains',
    price: 260,
    kind: 'kit',
    spoken: 'Snow chains. Huge grip on ice and snow. They will not go on a normal road, and they are slow.',
    gives: 'Huge grip on ice',
    costs: 'Slow, and no tarmac',
    bestOn: ['ice', 'snow'],
  },
  {
    id: 'sand',
    name: 'Sand hopper',
    price: 200,
    kind: 'kit',
    spoken: 'A sand hopper. Tap it to drop sand under your wheels. It does not last long.',
    gives: 'Grip where you drop it',
    costs: 'Only a few goes',
    bestOn: ['ice', 'snow'],
  },
  {
    id: 'weights',
    name: 'Wheel weights',
    price: 120,
    kind: 'kit',
    spoken: 'Wheel weights. They push your back wheels down. But the whole lorry gets heavier.',
    gives: 'More press, always',
    costs: 'Heavier up hills',
  },
  {
    id: 'liftaxle',
    name: 'Lift axle',
    price: 300,
    kind: 'kit',
    spoken: 'A lift axle. Tap it to lift the middle wheels, so the back ones press down harder.',
    gives: 'Press, at the tap of a button',
    costs: 'Bumpier ride',
  },
  {
    id: 'boards',
    name: 'Grip boards',
    price: 180,
    kind: 'kit',
    spoken: 'Grip boards. Slide them under a spinning wheel when you are really stuck.',
    gives: 'Gets you unstuck',
    costs: 'Two per job',
  },
  {
    id: 'ballast',
    name: 'Water tank',
    price: 340,
    kind: 'kit',
    spoken: 'A water tank. Fill it up for grip, empty it to stop quicker. Change it whenever you like.',
    gives: 'Press when you want it',
    costs: 'Longer to stop',
  },

  // --- and now the fun -----------------------------------------------------
  { id: 'paint.hivis', name: 'Orange paint', price: 60, kind: 'paint', spoken: 'Bright orange paint.', gives: '', costs: '' },
  { id: 'paint.slate', name: 'Slate paint', price: 60, kind: 'paint', spoken: 'Dark slate paint.', gives: '', costs: '' },
  { id: 'paint.cream', name: 'Cream paint', price: 60, kind: 'paint', spoken: 'Old fashioned cream paint.', gives: '', costs: '' },
  { id: 'paint.rust', name: 'Red paint', price: 60, kind: 'paint', spoken: 'Post box red paint.', gives: '', costs: '' },
  { id: 'horn.airhorn', name: 'Air horn', price: 80, kind: 'horn', spoken: 'A proper air horn.', gives: '', costs: '' },
  { id: 'horn.klaxon', name: 'Klaxon', price: 80, kind: 'horn', spoken: 'A honking klaxon.', gives: '', costs: '' },
  { id: 'horn.trumpet', name: 'Three tone horn', price: 110, kind: 'horn', spoken: 'A three note horn.', gives: '', costs: '' },
  { id: 'hat.cap', name: 'Flat cap', price: 50, kind: 'hat', spoken: 'A flat cap for the driver.', gives: '', costs: '' },
  { id: 'hat.beanie', name: 'Woolly hat', price: 50, kind: 'hat', spoken: 'A woolly hat.', gives: '', costs: '' },
  { id: 'hat.hardhat', name: 'Hard hat', price: 50, kind: 'hat', spoken: 'A yellow hard hat.', gives: '', costs: '' },
  { id: 'dog', name: 'A dog', price: 120, kind: 'extra', spoken: 'A dog for the passenger seat. Her name is up to you.', gives: '', costs: '' },
  { id: 'mudflaps', name: 'Mud flaps', price: 40, kind: 'extra', spoken: 'Mud flaps.', gives: '', costs: '' },
  { id: 'signwriting', name: 'Your name on the door', price: 100, kind: 'extra', spoken: 'Your own name, painted on the cab door.', gives: '', costs: '' },
]

export const itemById = (id: string): ShopItem | undefined => SHOP.find((i) => i.id === id)

export const KIT_ITEMS = SHOP.filter((i) => i.kind === 'kit')
export const FUN_ITEMS = SHOP.filter((i) => i.kind !== 'kit')
