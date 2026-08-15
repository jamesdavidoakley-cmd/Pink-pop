# GRIT

A haulage game for a six year old, played one-thumbed on a landscape tablet.

You run a small yard and drive a tipper lorry over ground that gets steadily
more slippery. The physics is real and it is taught entirely through the
controls: there is no quiz anywhere in this game, and no screen ever explains
friction in words to the child. If they can beat level 12, they have understood
it, and that is the only assessment.

```bash
npm install
npm run dev            # play at http://localhost:5173
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Play it, with hot reload |
| `npm test` | 48 tests: the physics claims, and a bot that beats every level |
| `npm run typecheck` | TypeScript, strict |
| `npm run build` | `dist/` — static, self-contained, service worker included |
| `npm run build:single` | `dist-single/grit.html` — the whole game as one file |
| `npm run check` | typecheck + test + build |
| `npm run check:offline` | Proves both builds work with the network off |

Serve `dist/` from anywhere static, or hand someone `dist-single/grit.html` and
let them double-click it. Both work with no network at all.

## The idea being taught

Grip at the driven wheel is **how sticky the ground is × how hard that wheel is
pressed down**. You spend that grip on three things — going, stopping and
turning — and if you ask for more than you have, the wheel spins. Weight only
helps if it is sitting on top of the driven wheel. And a wheel that is already
sliding is slipperier than one that is gripping, so the way out is to ease off,
not to push harder.

The child-facing words are **grippiness**, **press**, **grip coins** and
**wheelspin**. The adult words for the same ideas appear nowhere they can see —
there is a test that enforces this on the level content.

## How it is put together

```
src/
  physics/       the model. Pure, deterministic, fixed 1/60 s step.
    constants.ts   the surface table, placement factors, kit trade-offs
    model.ts       load on the drive axle, the grip budget, slip and recovery
    track.ts       a level is a list of stretches of road
    model.test.ts  one test per claim the game makes to a child
  components/
    GripMeter.tsx  the signature component (see below)
  game/
    levels.ts      14 levels + the free-play yard
    driveSim.ts    the drive screen's brain: lorry, bosses, particles, scoring
    bot.ts         a careful driver, used only by the tests
    shop.ts, xp.ts, analysis.ts
  render/          canvas: the diorama, the lorry, the painted-toy helpers
  screens/         load bay → predict → drive → results, plus yard/shop/grown-ups
  state/           two local profiles, saved to local storage
```

### The grip meter

Built first, and everything else is arranged around it. It is a slice of tyre
tread stood on its end. The grooves fill with grit as the grip you *have* rises;
a hi-vis marker rides up showing the grip you are *asking for*. When the marker
overtakes the grit, the tread pattern smears sideways and grit sprays off the
top. That single moment is where a child works out what they just did.

### The physics, honestly

```
grippiness = surface × tyres × sand,  and × 0.6 again once it is sliding
press      = rear axle's own share
           + Σ crate mass × placement factor   (0.90 back / 0.50 middle / 0.15 cab)
           + acceleration × k                  (it squats)
           + slope × k                         (the hill leans it back)
           + wheel weights, lift axle, ballast
grip       = grippiness × press × g
demand     = mass × acceleration + mass × g × sin(slope), combined with
             mass × v² / bend radius through a friction circle
```

Overspend and the wheel spins; grippiness drops to 0.6 of itself, so pressing
harder cannot rescue it. You recover when demand falls below 0.8 of what is
left, which is to say: by lifting off.

Braking spends from the same purse at the other end of the lorry, with the
weight shifted forward — so loading right at the back buys you *go* and costs
you *stop*. The brakes are a fixed-size hammer, which is why a heavier lorry
genuinely takes longer to pull up.

### Nothing in the shop is a percentage

Every item changes the sums and every one costs you something:

| Item | Gives | Costs |
|---|---|---|
| Knobbly tyres | Big multiplier in mud and gravel | Worse on dry tarmac |
| Snow chains | Enormous on ice and snow | Caps top speed; won't fit on tarmac |
| Sand hopper | Real, local grip boost | A few goes per job |
| Wheel weights | More press, always | More mass: hills and stops get harder |
| Lift axle | Dumps the middle axle onto the drive axle | — |
| Grip boards | Gets a stuck wheel out | Two per job |
| Ballast tank | Press on demand, mid-level | Longer stopping distance |

Plus paint, horns, hats, a dog, mud flaps and the player's own name signwritten
on the cab door, so XP is not only homework.

## Tests as the design document

`npm test` runs 48 tests in two files.

`physics/model.test.ts` pins each claim: the same crate is worth six times as
much over the rear axle as over the cab; surfaces get slipperier in exactly the
order the levels meet them; flooring it never recovers a spinning wheel but
easing off does; ballast trades grip against stopping distance; a corner taken
fast on gravel slides wide.

`game/levels.test.ts` drives a bot through every level with only the kit the
game has handed over by that point, and fails if any level cannot be finished.
It also checks the levels that exist to teach placement genuinely punish the
wrong placement — level 4 is impossible with the box over the cab and
straightforward over the axle — so the lesson is not a coincidence.

## Kid-proofing

Landscape tablet first; large targets; no double taps; no drag precision (tap a
crate, tap a spot). Almost no reading, with spoken narration for every
instruction. No adverts, no purchases, no sign-up, no external links, no chat,
no leaderboard. Two local profiles. Never a game over, never a life lost, XP
only ever added, instant retry from the last post. Reduced motion is respected
in the shell and on the canvas.

A grown-up panel sits behind a simple gate (type the number spelled out in
words). It reports which concepts have landed — every one evidenced by
something the child did at the controls — and holds the **Show the numbers**
toggle, which overlays the live values and the formula for an older sibling.

## Fonts

Oswald (display) and Nunito (body) are bundled as woff2 in `src/assets/fonts`,
both SIL Open Font License 1.1. Nothing is fetched at runtime.
