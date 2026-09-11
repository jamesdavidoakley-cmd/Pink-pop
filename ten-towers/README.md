# Ten Towers

A place-value game for Max. Numbers are glowing crystal blocks in a night city:

| Block | Worth | Shape |
|---|---|---|
| gem | 1 | a cube |
| rod | 10 | ten gems in a line |
| slab | 100 | ten rods side by side |
| cube | 1,000 | ten slabs stacked |

Ten of anything **fuses** into one of the next (that's carrying). One of anything **smashes** into ten of the one below (that's borrowing). The columns sit left to right as thousands, hundreds, tens, ones, so the counts under them *are* the digits of the number.

## Modes

Each mode has three tiers (to 100, to 1,000, to 10,000; Round It uses nearest 10, 100, 1,000) and five rounds per level. Stars are earned for few mistakes; every first-time level completion lights a new tower in the city skyline.

- **Build It** — build the number on the blueprint, then press BANG when you think it's right. A wrong bang fizzles and points at the column that's off. Higher tiers give tricky blueprints like "4 slabs, 12 rods and 3 gems" so the fuse has to happen.
- **Add On** — the tower is pre-built; add the blocks on the blueprint, watch the carries fuse, then read the new number off the columns and type it.
- **Take Away** — remove blocks; when a column runs dry the smash button pulses. Read what's left and type it.
- **Make 100** — fill a tower to exactly 100 (or 1,000) and press BANG. The final fuse is the payoff.
- **Round It** — a glowing halfway line sits five blocks up the deciding column. Past it, round up; under it, round down. Pick the nearer station, then watch the smaller columns melt away and the deciding column either finish its ten or vanish.
- **Free build** — a sandbox with every button enabled.

### The Grumble Wall

After the fifth round a grumpy brick wall rises behind the plots and a SMASH button appears. Your tower lifts, winds up and charges it. What happens depends on how the level went:

| Mistakes | Stars | Result |
|---|---|---|
| 0–1 | ★★★ | Straight through. Every brick flies, the eyes go with them. |
| 2–3 | ★★ | Cracks it. The top half explodes, the tower wobbles to a stop. |
| 4+ | ★ | Bonk. Three bricks fall, the wall shrugs, the tower tumbles back to its plots. |

The level still counts and the city still grows. The wall is the reason to try for fewer slips next time.

On an iPad, open it in Safari and use Share → Add to Home Screen for a full-screen app. Everything is spoken (Web Speech, en-GB voice when available) and every sound is a tiny synth, so it works offline with no assets.

## Run

```bash
npm install
npm run dev          # http://localhost:5174
npm run build        # static build in dist/
npm run typecheck
npm test             # number words, tower carry/borrow, level generation
npm run check        # headless: boots, fuses, smashes, plays a round of every mode + a full level and the wall finale
```

`npm run check` needs the dev server running. It uses the Chromium at `/opt/pw-browsers/chromium` if present.

## Layout

- `src/number.ts` — digits, British number words, seeded RNG
- `src/tower.ts` — the model: add / remove / fuse / smash
- `src/levels.ts` — round generation per mode and tier
- `src/scene.ts` — three.js: columns, animations, skyline, bloom
- `src/hud.ts` — DOM: blueprint, column buttons, numpad, menus
- `src/game.ts` — state machine tying it together
- `src/audio.ts` — synth sounds + speech
