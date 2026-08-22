# Shoot The Day

A small browser game that teaches **reportage (documentary) wedding photography** by making you do it.
One venue, three scenes, about eight minutes. You are the photographer. The only verbs are **move,
crouch, raise the camera, shoot** — there is deliberately no "pose them" button, because you cannot
direct anybody at a real wedding.

```bash
cd shoot-the-day
npm install
npm run dev        # → http://localhost:5174
```

| Command | What |
|---|---|
| `npm run dev` | Play it |
| `npm run build` | Typecheck + static production build in `dist/` |
| `npm test` | Unit tests plus the two-player proof (below) |
| `npm run typecheck` | TypeScript strict check |
| `npm run ci` | typecheck + test + build |
| `npm run shots -- <url> <dir>` | Headless play-through; screenshots each stage, fails on any console error |
| `npm run scenes -- <url> <dir>` | One screenshot per scene from a good vantage point |

## The screen

Two live views, always both on.

- **Left, the plan.** Overhead view of the venue: you, the guests, the furniture, the window light,
  and a translucent cone showing where the lens is pointed and how wide it sees.
- **Right, the viewfinder.** A real through-the-lens render, built by projecting every body in the
  cone through a pinhole camera on a flat floor. This is where the teaching lands: a great moment
  shot from the wrong side is a photograph of the back of someone's head, and you can see that
  before you press.

The viewfinder, the contact-sheet thumbnails and the shot scorer all go through the same
`Projector`, so what you are marked on is exactly what you saw.

## The five things it teaches

1. **Anticipate.** Moments telegraph. The tell is visible on the plan; only the viewfinder tells you
   what it is.
2. **Position beats zoom.** One lens, no zoom. Clean background, clear line, low angle.
3. **Shoot the reaction.** During the vows, the frame is the mother's face.
4. **Stay invisible.** Guests have an `awareness` that rises when you are close, still in their
   eyeline, or moving fast nearby. Over the threshold they turn to the lens, and everything they are
   in scores 0.3×.
5. **Cover the day.** Each scene has must-get beats. Missing one costs 15 points off the day,
   however good the candids were.

## The day

| Scene | Length | Card | Light | Must-gets |
|---|---|---|---|---|
| Ceremony | 100s | 24 frames | Window light from stage left; the aisle is theirs | Ring exchange, the kiss, a guest reaction during the vows |
| Confetti | 60s | 18 frames | Open backlight behind the couple's exit | Couple mid-confetti, a child, one wide of the crowd |
| Speeches | 100s | 24 frames | Dim room, one practical lamp | Best man mid-delivery, the couple laughing, a table reaction |

The card does not refill and there is no way to buy more. Holding the shutter bursts at 5fps and
eats it. An empty frame scores zero and still costs a frame.

Moments run **dormant → tell (1.5s) → build (2s) → peak (0.6s) → decay (1.5s) → gone**, worth
0.3 / 0.6 / 1.0 / 0.5 of their value depending on when you press. Eight to fourteen moments a scene,
mostly minor, and the minor ones deliberately overlap the must-gets so you have to choose.

## Scoring a frame

```
score = phase × posedPenalty × (0.30 moment + 0.20 framing + 0.20 clarity
                              + 0.15 light  + 0.10 angle   + 0.05 layers) × 100
```

- **moment** — is a real moment in frame, and are you on the right side of the face
- **framing** — subject size and placement, punished for too small, clipped, or shoved to the edge
- **clarity** — occlusion by anything nearer than the subject
- **light** — the angle between where you are pointed and the scene's light: shooting into it wins
- **angle** — how far below their eyeline you got
- **layers** — a foreground body that frames the subject without covering it

Every constant lives in one place, [`src/game/tuning.ts`](src/game/tuning.ts). Retune there first.

## Debrief

After the third scene the day ends on a **contact sheet**. No image is ever stored: each thumbnail is
re-rendered from the camera state and the body positions that frame recorded. Under each one is a
plain-English line generated from whichever score component was weakest — "Right moment, wrong side.
The back of a head is not a guest." Then the summary: frames used, keepers, must-gets hit and missed,
and a verdict tied to one of the five lessons. The only button is **Replay the day**. The day is the
unit; there is no level select.

## Layout

```
src/game/       tuning, types, maths, the venue and its three scenes,
                the simulation (fixed 60Hz), shot scoring, day grading, the runner
src/render/     projection (the pinhole camera), procedural sprites, lighting,
                the plan renderer, the viewfinder renderer, palette
src/ui/         React shell: title, in-game overlays, contact sheet, debrief
tests/          unit tests and two scripted players
```

No image or audio assets: every sprite is drawn with canvas primitives.

## The gate

`tests/play.test.ts` plays the whole day twice, headlessly, with two scripted players, and asserts
they come out clearly apart:

- **the sprayer** marches to the front, stands at full height and bursts all day —
  *0/9 beats, 0 keepers, 51 empty frames, 15 posed frames, grade 0*
- **the photographer** crouches, stands off, moves into position early, waits for the peak —
  *9/9 beats, 26 keepers, grade 88*

If a change stops separating those two, the tuning is wrong; fix that before adding anything.
