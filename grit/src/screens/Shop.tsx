/**
 * The shop. Kit on the left, fun on the right.
 *
 * Every kit item shows what it gives you and what it costs you, because none of
 * them is simply better. The fun half has no downside at all and that is the
 * point of it.
 */

import { useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { BigButton, Panel, XpBadge } from '../components/ui'
import { speak } from '../a11y/narration'
import { audio } from '../audio/engine'
import { FUN_ITEMS, KIT_ITEMS, type ShopItem } from '../game/shop'
import { PAINT_JOBS } from '../render/lorry'
import { useGame, usePlayer } from '../state/store'
import { fitGranted } from './Yard'
import { SURFACE_NAME } from '../theme'
import type { Fitted, Profile } from '../state/save'

const ICONS: Record<string, IconName> = {
  knobbly: 'knobbly',
  chains: 'chains',
  sand: 'sand',
  weights: 'weights',
  liftaxle: 'liftaxle',
  boards: 'boards',
  ballast: 'tank',
  dog: 'dog',
  mudflaps: 'mudflaps',
  signwriting: 'name',
}

const iconFor = (item: ShopItem): IconName =>
  ICONS[item.id] ??
  (item.kind === 'paint' ? 'paint' : item.kind === 'horn' ? 'horn' : item.kind === 'hat' ? 'hat' : 'crate')

export function Shop() {
  const { go } = useGame()
  const { profile, update } = usePlayer()
  const [tab, setTab] = useState<'kit' | 'fun'>('kit')
  const spent = profile.owned.length

  const buy = (item: ShopItem) => {
    if (profile.owned.includes(item.id) || profile.xp < item.price) {
      speak(profile.xp < item.price ? 'Not quite enough yet. Go and earn some more.' : item.spoken, {
        force: true,
      })
      return
    }
    audio.chime(2)
    speak(item.spoken, { force: true })
    update((p) => ({
      ...p,
      xp: p.xp - item.price,
      owned: [...p.owned, item.id],
      fitted: item.kind === 'kit' ? fitGranted(p.fitted, item.id) : p.fitted,
      cosmetics: applyCosmetic(p, item),
    }))
  }

  const items = tab === 'kit' ? KIT_ITEMS : FUN_ITEMS

  return (
    <div className="flex h-full w-full flex-col bg-paper">
      <header className="flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={() => go({ k: 'yard' })}
          className="toy-sm rounded-2xl bg-card px-3 py-3 text-slate-deep"
          aria-label="Back to the yard"
        >
          <Icon name="back" className="h-6 w-6" />
        </button>
        <h1 className="signwritten-centred text-4xl text-haulage">The shop</h1>
        <XpBadge xp={profile.xp} />
      </header>

      <div className="flex gap-2 px-3">
        <TabButton active={tab === 'kit'} onClick={() => setTab('kit')} label="Kit" icon="knobbly" />
        <TabButton active={tab === 'fun'} onClick={() => setTab('fun')} label="Fun" icon="paint" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
          {items.map((item) => (
            <ShopTile
              key={item.id}
              item={item}
              owned={profile.owned.includes(item.id)}
              affordable={profile.xp >= item.price}
              onBuy={() => buy(item)}
            />
          ))}
        </div>

        {tab === 'kit' ? (
          <Panel className="mt-4 p-4">
            <h2 className="signwritten mb-3 text-2xl text-slate-deep">What is fitted</h2>
            <FittedControls profile={profile} update={update} />
          </Panel>
        ) : (
          <Panel className="mt-4 p-4">
            <h2 className="signwritten mb-3 text-2xl text-slate-deep">How it looks</h2>
            <CosmeticControls profile={profile} update={update} />
          </Panel>
        )}
      </div>

      <div className="p-3">
        <BigButton tone="green" icon="lorry" label="Back to the yard" onClick={() => go({ k: 'yard' })} />
        <span className="sr-only">{spent} things bought</span>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: IconName
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`toy-sm signwritten-centred flex items-center gap-2 rounded-t-2xl px-5 py-3 text-2xl ${
        active ? 'bg-card text-slate-deep' : 'bg-grit-dark/40 text-slate-deep/70'
      }`}
    >
      <Icon name={icon} className="h-6 w-6" />
      {label}
    </button>
  )
}

function ShopTile({
  item,
  owned,
  affordable,
  onBuy,
}: {
  item: ShopItem
  owned: boolean
  affordable: boolean
  onBuy: () => void
}) {
  return (
    <button
      type="button"
      onClick={onBuy}
      className={`toy toy-press flex flex-col items-start gap-2 rounded-2xl p-3 text-left ${
        owned ? 'bg-haulage text-cream' : affordable ? 'bg-card text-slate-deep' : 'bg-grit-dark/40 text-slate-deep/60'
      }`}
    >
      <div className="flex w-full items-start justify-between">
        <Icon name={iconFor(item)} className="h-12 w-12" />
        {owned ? (
          <Icon name="tick" className="h-6 w-6 text-hivis" />
        ) : (
          <span className="signwritten-centred flex items-center gap-1 text-2xl">
            <Icon name="star" className="h-5 w-5 text-hivis" />
            {item.price}
          </span>
        )}
      </div>
      <span className="signwritten text-xl leading-tight">{item.name}</span>

      {item.kind === 'kit' ? (
        <div className="space-y-1 text-sm leading-tight">
          <p className="flex items-start gap-1">
            <span aria-hidden className="text-haulage-light">▲</span>
            {item.gives}
          </p>
          <p className="flex items-start gap-1 opacity-80">
            <span aria-hidden className="text-hivis">▼</span>
            {item.costs}
          </p>
          {item.bestOn ? (
            <p className="opacity-70">Best on {item.bestOn.map((s) => SURFACE_NAME[s]).join(' and ')}</p>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

function FittedControls({
  profile,
  update,
}: {
  profile: Profile
  update: (fn: (p: Profile) => Profile) => void
}) {
  const setFitted = (patch: Partial<Fitted>) =>
    update((p) => ({ ...p, fitted: { ...p.fitted, ...patch } }))

  const tyreOptions: { id: Fitted['tyres']; label: string; icon: IconName; owned: boolean }[] = [
    { id: 'road', label: 'Normal', icon: 'tyre', owned: true },
    { id: 'knobbly', label: 'Knobbly', icon: 'knobbly', owned: profile.owned.includes('knobbly') },
    { id: 'chains', label: 'Chains', icon: 'chains', owned: profile.owned.includes('chains') },
  ]

  return (
    <div className="flex flex-wrap gap-4">
      <div>
        <p className="signwritten mb-2 text-lg text-slate-deep/70">Tyres</p>
        <div className="flex gap-2">
          {tyreOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={!option.owned}
              onClick={() => setFitted({ tyres: option.id })}
              className={`toy-sm flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl disabled:opacity-35 ${
                profile.fitted.tyres === option.id ? 'bg-hivis text-slate-deep' : 'bg-card text-slate-deep'
              }`}
            >
              <Icon name={option.icon} className="h-8 w-8" />
              <span className="text-xs">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="signwritten mb-2 text-lg text-slate-deep/70">Bolted on</p>
        <div className="flex flex-wrap gap-2">
          <Toggle
            icon="weights"
            label="Weights"
            owned={profile.owned.includes('weights')}
            on={profile.fitted.wheelWeights}
            onToggle={() => setFitted({ wheelWeights: !profile.fitted.wheelWeights })}
          />
          <Toggle
            icon="liftaxle"
            label="Lift axle"
            owned={profile.owned.includes('liftaxle')}
            on={profile.fitted.liftAxle}
            onToggle={() => setFitted({ liftAxle: !profile.fitted.liftAxle })}
          />
          <Toggle
            icon="sand"
            label="Sand"
            owned={profile.owned.includes('sand')}
            on={profile.fitted.sandHopper}
            onToggle={() => setFitted({ sandHopper: !profile.fitted.sandHopper })}
          />
          <Toggle
            icon="boards"
            label="Boards"
            owned={profile.owned.includes('boards')}
            on={profile.fitted.boards}
            onToggle={() => setFitted({ boards: !profile.fitted.boards })}
          />
          <Toggle
            icon="tank"
            label="Tank"
            owned={profile.owned.includes('ballast')}
            on={profile.fitted.ballastTank}
            onToggle={() => setFitted({ ballastTank: !profile.fitted.ballastTank })}
          />
        </div>
      </div>
    </div>
  )
}

function CosmeticControls({
  profile,
  update,
}: {
  profile: Profile
  update: (fn: (p: Profile) => Profile) => void
}) {
  const owned = (id: string) => profile.owned.includes(id)
  const set = (patch: Partial<Profile['cosmetics']>) =>
    update((p) => ({ ...p, cosmetics: { ...p.cosmetics, ...patch } }))

  return (
    <div className="flex flex-wrap gap-5">
      <div>
        <p className="signwritten mb-2 text-lg text-slate-deep/70">Paint</p>
        <div className="flex gap-2">
          {Object.entries(PAINT_JOBS).map(([id, job]) => {
            const unlocked = id === 'haulage' || owned(`paint.${id}`)
            return (
              <button
                key={id}
                type="button"
                disabled={!unlocked}
                onClick={() => set({ paint: id })}
                aria-label={job.label}
                className={`h-14 w-14 rounded-2xl border-4 border-slate-deep disabled:opacity-30 ${
                  profile.cosmetics.paint === id ? 'ring-4 ring-hivis' : ''
                }`}
                style={{ background: job.body }}
              />
            )
          })}
        </div>
      </div>

      <div>
        <p className="signwritten mb-2 text-lg text-slate-deep/70">Horn</p>
        <div className="flex gap-2">
          {['none', 'airhorn', 'klaxon', 'trumpet'].map((id) => (
            <button
              key={id}
              type="button"
              disabled={id !== 'none' && !owned(`horn.${id}`)}
              onClick={() => {
                set({ horn: id })
                audio.start()
                audio.horn(id)
              }}
              className={`toy-sm h-14 w-14 rounded-2xl disabled:opacity-30 ${
                profile.cosmetics.horn === id ? 'bg-hivis' : 'bg-card'
              }`}
              aria-label={id}
            >
              <Icon name="horn" className="mx-auto h-7 w-7 text-slate-deep" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="signwritten mb-2 text-lg text-slate-deep/70">Driver</p>
        <div className="flex gap-2">
          {['none', 'cap', 'beanie', 'hardhat'].map((id) => (
            <button
              key={id}
              type="button"
              disabled={id !== 'none' && !owned(`hat.${id}`)}
              onClick={() => set({ hat: id })}
              className={`toy-sm h-14 w-14 rounded-2xl disabled:opacity-30 ${
                profile.cosmetics.hat === id ? 'bg-hivis' : 'bg-card'
              }`}
              aria-label={`Hat ${id}`}
            >
              <Icon name="hat" className="mx-auto h-7 w-7 text-slate-deep" />
            </button>
          ))}
          <Toggle
            icon="dog"
            label="Dog"
            owned={owned('dog')}
            on={profile.cosmetics.dog}
            onToggle={() => set({ dog: !profile.cosmetics.dog })}
          />
          <Toggle
            icon="mudflaps"
            label="Flaps"
            owned={owned('mudflaps')}
            on={profile.cosmetics.mudflaps}
            onToggle={() => set({ mudflaps: !profile.cosmetics.mudflaps })}
          />
        </div>
      </div>

      {owned('signwriting') ? (
        <div>
          <p className="signwritten mb-2 text-lg text-slate-deep/70">Name on the door</p>
          <input
            value={profile.cosmetics.signwriting}
            maxLength={10}
            onChange={(e) => set({ signwriting: e.target.value })}
            className="toy-sm signwritten-centred w-44 rounded-xl bg-card px-3 py-3 text-2xl text-slate-deep"
            placeholder="YOUR NAME"
          />
        </div>
      ) : null}
    </div>
  )
}

function Toggle({
  icon,
  label,
  owned,
  on,
  onToggle,
}: {
  icon: IconName
  label: string
  owned: boolean
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      disabled={!owned}
      onClick={onToggle}
      aria-pressed={on}
      className={`toy-sm flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl disabled:opacity-35 ${
        on ? 'bg-hivis text-slate-deep' : 'bg-card text-slate-deep'
      }`}
    >
      <Icon name={icon} className="h-8 w-8" />
      <span className="text-xs">{label}</span>
    </button>
  )
}

function applyCosmetic(profile: Profile, item: ShopItem): Profile['cosmetics'] {
  if (item.id.startsWith('paint.')) return { ...profile.cosmetics, paint: item.id.slice(6) }
  if (item.id.startsWith('horn.')) return { ...profile.cosmetics, horn: item.id.slice(5) }
  if (item.id.startsWith('hat.')) return { ...profile.cosmetics, hat: item.id.slice(4) }
  if (item.id === 'dog') return { ...profile.cosmetics, dog: true }
  if (item.id === 'mudflaps') return { ...profile.cosmetics, mudflaps: true }
  if (item.id === 'signwriting') {
    return { ...profile.cosmetics, signwriting: profile.name.slice(0, 10).toUpperCase() }
  }
  return profile.cosmetics
}
