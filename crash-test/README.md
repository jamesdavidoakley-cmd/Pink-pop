# Crash Test

Basic engineering for Max: build it, press TEST, watch it hold or fail, fix it.

Every part has one honest property. Every level ends with a load arriving. When something breaks, the game slows down, circles the first part that failed, and says why in words a six-year-old can use next time.

| Part | Costs | What it does |
|---|---|---|
| Beam | 2 | Strong and short (up to 3). Decks and frames. |
| Long beam | 3 | Spans 4 to 6, but sags in the middle and snaps if the middle isn't held. |
| Pillar | 2 | Holds weight straight down. Vertical only. |
| Brace | 1 | Thin and cheap. Corner to corner turns a wobbly square into two triangles. |
| Rope | 1 | Only pulls. Goes slack when pushed. |
| Block, wide block | 1, 2 | For stacking. The wide one is heavy. |

Beams glow green, then amber, then red as they strain, so you can see where the force is going before it snaps.

## Modes

Three levels each. Two loads per level: a light one, then a heavy one. Level 3's heavy load is Max himself.

- **Cross the Gap** — bridge a canyon for a cart. Long beams sag. Hold the middle up, or make triangles.
- **Don't Wobble** — build a gate; a goat runs into it and leans. Squares wobble, triangles don't.
- **Stand Up** — stack blocks to the star and survive an earthquake. Wide at the bottom, heavy at the bottom.
- **Lift It** — put the pivot under the plank so Max can lift the boulder. Long arm, big lift.
- **Hold It Up** — build a roof over the sheep pen; rocks fall on it. Loads need a path down to the ground.

Stars: one for holding the light load, two for holding both, three for doing it at or under the level's par cost.

## Physics

`src/physics.ts` is a small XPBD world: point masses, distance links with compliance, a three-point bend link for long beams, and circle-versus-segment collisions with friction. Link forces come straight out of the solver's Lagrange multipliers, so breaking is force-based and honest. Everything is calibrated against real builds in `tests/sim.test.ts` (a hinged deck holds one crate and snaps under three, a braced gate holds, a thin tower topples, and so on).

## Run

```bash
npm install
npm run dev          # http://localhost:5175
npm run build
npm run typecheck
npm test             # physics + every mode with a good build and a bad build
npm run check        # headless: boots, plays six scenarios, screenshots to shots/
CALIB=1 npx vitest run tests/calib.test.ts   # print stresses for a sweep of builds
```

Landscape is best. On an iPad, Share → Add to Home Screen for a full-screen app.
