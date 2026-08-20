# FLESH — The Long Drive

A chunky, cel-shaded 3D game where you play Earl Reagan, trail boss for the
Trans-Time Corporation, driving a herd of ten-tonne horned dinosaurs across
Cretaceous badlands from Carver City to Trans-Time Base 3, while packs of
tyrannosaurs try to scatter and eat them.

**This is a herding game in which combat is the thing that pulls you away from
your job.** The stun rifle is deliberately not a solution. It cannot kill, it
takes three hits, and every shot costs calm on every animal within fifteen
metres of the muzzle. Over three seeds on the Fern Flats, a player who stands
still and shoots everything delivers 7, 8 and 3 head; a player who never fires
and only uses the goad and the whoop delivers 11, 11 and 11. That comparison is
an automated test, not a claim.

Nothing bleeds and nothing is eaten on screen. Weapons are stunners, and stunned
dinosaurs flop over with snoring Zs and wake up later. A lost animal wanders off
the map bleating and is written off by the Controller as a logistics line item.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

| Command | What |
|---|---|
| `npm run dev` | Play it, with hot reload |
| `npm run build` | Typecheck, then a static production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | The full suite, including every acceptance test in the brief |
| `npm run ci` | typecheck + test + build |

Two dev tools, both of which earned their keep:

| Command | What |
|---|---|
| `node scripts/smoke.mjs [shot.png]` | Boots the built game in Chromium, plays it, fails on any console error, and reports the draw-call and triangle budget |
| `node scripts/shots.mjs <dir>` | Captures every screen for a visual check |

And `?rig=` in the browser opens a turntable for every animal in the game —
`?rig=herd`, `?rig=rex`, `?rig=oldoneeye`, `?rig=reagan`, and so on, with `&d=`
for camera distance. Judging a procedural dinosaur from gameplay screenshots is
hopeless; it is always half behind another one at the wrong angle.

## Controls

| Keys | What |
|---|---|
| W A S D | Move |
| Mouse | Look (click to lock the pointer) |
| Shift | Sprint — drains stamina, and frightens the herd |
| Space | Jump — hold for height |
| Left click | Fire the stun rifle |
| Right click (hold) | Aim over the shoulder |
| **E** | **Goad** — a wide forward shove. Free, quiet, and the best weapon in the game |
| **Q** | **Whoop** — the gather call. Restores calm and pulls strays in |
| F | Mount / dismount the hover bike (it stays where you left it) |
| R / C | Net gun / sonic boomer, once bought |
| Tab | Herd map |
| M | Mute |
| Esc | Pause |

Touch devices get a thumb stick and buttons.

## How it plays

Collect your herd at the pen, drive it beacon to beacon to the Trans-Time gate,
and deliver whatever survives. Head delivered converts to Flesh Credits; spend
them at the Commissary between drives.

**The leader trick.** Each herd has one matriarch — visibly larger, with a
hazard-yellow Trans-Time brand on her flank and a marker above her. The other
animals weight cohesion toward *her* rather than toward the herd's centroid, so
in practice you push one animal and eleven trail after her. Steering twelve
independent animals is misery. Steering one is a pleasure.

**Panic is the whole clock.** Every animal has calm from 0 to 100. Predators,
gunfire, thunder and cliff edges drain it. Standing near Reagan restores it —
unless he is sprinting, or working the rifle. Below 25 an animal bolts in a
straight line at double speed for five seconds, ignoring the herd entirely, and
anything within ten metres of a bolting animal loses ten calm a second. One rex
you ignore for eight seconds costs you the whole formation.

**Stragglers.** Any animal more than forty metres from the matriarch stops
following and grazes where it stands. If it is still adrift when you make the
next beacon, it is lost. That is what the hover bike is for.

Six drives, each teaching one thing: the controls, the shoot-versus-herd
trade-off, steering a stampede along a cliff, reading a boss's rhythm at a water
crossing, dealing with panic-dealers before the thing that looks more dangerous,
and finally Old One Eye — who does not chase you, hunts the herd patiently while
you try to get the last head through the fence, and cannot see anything in a
ninety-degree cone on her blind left side. Nothing in the game tells you that.

## What is inside

```
src/
  core/      maths, tuning constants, input
  sim/       the simulation — no three.js anywhere in here
  world/     analytic heightfield terrain
  levels/    the six drives
  art/       toon shading, outlines, and every procedural rig
  game/      the r3f scene, camera, effects
  ui/        HUD, herd map, menus, commissary
  state/     zustand store, save, difficulty
tests/       the acceptance tests from §16 of the brief, plus per-level runs
```

The important architectural decision is that **the simulation is pure
TypeScript with no renderer attached**, stepping at a fixed 1/60s. The r3f layer
reads it and positions meshes; it never writes to it. That is what lets the
acceptance tests actually *play* the game — twice, differently, with bots — and
compare the outcomes, rather than asserting on constants.

Every tuning number the brief pins down lives in `src/core/tuning.ts` and cites
the line it came from.

## Deviations from the brief

**No `@react-three/rapier`.** Rigid-body dynamics is the wrong model for boid
steering with forty agents, and a physics engine in the loop would make the
headless acceptance tests impossible — the tests are the only way to check the
claims in §16, so they win. Collision is done against the analytic heightfield
instead: `terrain.height(x, z)` is the single source of truth for the ground,
and both the simulation and the visible mesh call it, so they cannot disagree.
Everything else in §3 stands.

**Two rules interpreted rather than followed literally**, both to make the
design work rather than to dodge it:

- A bolting animal ignores *cohesion*, as the brief says — but not the trail
  boss. If it ignored Reagan too, a stampede could only be waited out and Bone
  Gulch's set piece would be a cutscene you watch. Panicked animals still feel
  his shove, at reduced weight, so a stampede can be shouldered off the edge
  line.
- The map edge does not eat animals. Losing head to an invisible line is not a
  mechanic anyone can learn; an animal that bolts into the boundary pulls up and
  turns back. The straggler-at-the-beacon rule is the real pressure.

## Acceptance tests

All of §16, as automated tests in `tests/acceptance.test.ts`, except the frame
rate:

| From the brief | Where |
|---|---|
| Standing still and shooting loses more head than the goad and the whoop | `§16 — the rifle is not the answer` |
| Pushing the matriarch moves the whole herd within two seconds | `§16 — the herd reads the trail boss` |
| A single ignored tyrannosaur causes a full stampede in under ten seconds | `§16 — one ignored tyrannosaur…` |
| A stampede is recoverable with the whoop and repositioning | same |
| Head count, credits and upgrades survive a refresh | `tests/save.test.ts` |
| Old One Eye cannot be beaten from the front | `§16 — Old One Eye` |
| 60fps with twelve head, five predators and full foliage | see below |

The frame-rate one cannot be honestly asserted from here: this was built in a
container with software rendering, where nothing runs at sixty frames a second.
What *is* measured is the budget it asks for — the simulation steps a full
twelve-head, five-predator world in well under a millisecond (`§16 —
performance budget`), and the smoke script reports the render side at **335 draw
calls and 166k triangles**, which is a comfortable 60fps budget on any GPU of
the last decade. Somebody should still play it on a real laptop before that box
is ticked.

## Rights

Flesh, Earl Reagan, Trans-Time and Old One Eye are Rebellion's property, after
Pat Mills' strip in *2000 AD* Prog 1, 1977. This is a personal build and nothing
in it is for sale. If it ever went public the serial numbers would have to come
off — the mechanics work perfectly well with a generic frontier setting and
invented names.
