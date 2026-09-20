# Numbermoor

A wizard school of numbers. Original setting, no borrowed characters. Pick a house, earn house points, and take two classes:

## Potion Scales — an equation is a balance
A brass scale in a torchlit dungeon. One pan holds a mystery bottle and some drops, the other holds drops. Tap a drop to take it off. Take from one pan only and the scale tips, with real physics, until you take the same from the other. When the bottle stands alone and the scale balances, the other pan tells you its weight. Pick the number and the potion brews and erupts.

- Level 1: one bottle. `? + 3 = 8`
- Level 2: twin bottles, cleared then halved. `2? + 4 = 12`
- Level 3: bottles on both pans. `? + 5 = 2? + 1`

The last bottle can never come off, because it is the thing being weighed. Everything else is allowed, and the scale shows you whether it was fair. Undo is always there.

## Broom Formations — multiplication is an array
N brooms in a hangar under a castle at night. Set rows and brooms per row and press FLY. If rows × brooms per row is exactly N, the formation counts. If it's less, the leftovers stay in the hangar (a remainder). If it's more, you're short. Find every formation and the sky fills with fireworks in that exact array. A number that only flies single file is prime, and the game says so.

- Level 1: numbers to 12. Level 2: to 24. Level 3: to 36, with more primes.

## Run

```bash
npm install
npm run dev          # http://localhost:5179
npm test             # puzzle generation, balance rules, factor pairs and remainders
npm run check        # headless: picks a house, solves a potion by tapping, flies every formation
```

Everything is spoken. On an iPad, Share → Add to Home Screen.
