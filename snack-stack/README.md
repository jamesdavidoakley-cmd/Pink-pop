# Snack Stack

Ten Towers with food. Same place-value game, same carrying and borrowing, but now it's Max's bakery:

| Block | Worth | What it is |
|---|---|---|
| cookie | 1 | a chocolate-chip cookie |
| pack | 10 | ten cookies snapped into a striped pack |
| box | 100 | ten packs in a blue box |
| crate | 1,000 | ten boxes in a wooden crate |

Ten of anything **snaps** into one of the next (carrying). One of anything **opens** into ten of the one below (borrowing). The plates sit left to right as thousands, hundreds, tens, ones, so the counts under them are the digits.

## Modes

- **Fill the Order** - bake the number on the order, then press BANG.
- **Big Delivery** - a delivery arrives; add it, watch ten cookies snap into a pack, then say how many cookies there are now.
- **Hungry Customers** - customers buy cookies; open a pack when the cookie plate runs dry, then say how many are left.
- **Fill the Box** - bake up to exactly 100 or 1,000.
- **Round It** - a halfway line five high on the deciding plate. Past it, round up.
- **Free bake** - a sandbox.

After five rounds the Giant Jelly rises. Tap SMASH and the cookie tower charges it: three stars splat straight through, two split it, one bounces off. Every first-time level completion puts a candle-lit cake on the shelf.

## Run

```bash
npm install
npm run dev          # http://localhost:5178
npm run build
npm test
npm run check        # headless: snaps, opens, plays every mode, a full level and the jelly finale
```
