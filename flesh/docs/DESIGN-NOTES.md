# Design notes

What was decided, what was measured, and what turned out to be wrong. Written
as the build went, so it is in build order rather than importance order.

---

## The one paragraph that governs everything

> This is not a shooter with dinosaurs to escort. It is a herding game where
> combat is the thing that pulls you away from your job.

Every tuning decision below was made against that sentence. When a change made
shooting better play, it was wrong, regardless of how it felt in isolation.

---

## Why the simulation has no renderer in it

`src/sim/` imports nothing from three.js. The world is a plain mutable object
stepped by `stepWorld(world, input, dt)` at a fixed 1/60s, and the r3f layer
reads it and moves meshes.

That is not tidiness for its own sake. §16 of the brief is a list of statements
about how the game *plays* — "a player who stands still and shoots everything
loses more head than a player who never fires" — and you cannot check that by
asserting on a constant. You have to play it, twice, differently. A pure
simulation makes that a unit test that runs in fifteen seconds, and it is the
only reason any of the numbers in this document exist.

It also decided the rapier question. Rigid-body dynamics is the wrong model for
boid steering with forty agents anyway, but the deciding factor was that a
physics engine in the loop makes deterministic headless replay impossible.

---

## The leader trick, and the bug that nearly killed it

The brief's own words: the player pushes one animal and the rest follow.
Followers weight cohesion toward the matriarch at 2.5 instead of toward the
centroid at 1.0.

The first implementation did exactly that and the herd would not move. The
matriarch was holding the herd centroid with the same cohesion force her
followers used on her, so every shove Reagan gave her was cancelled by eleven
animals pulling the other way. **She leads; she does not follow.** Her tie to
the centroid is now loose — it only engages beyond fifteen metres — and the
whole mechanic came alive.

Two smaller ones in the same system:

- **Travelling momentum has to be refreshed by a *reason* to travel**, never by
  the fact of already travelling. The first version set a "keep moving" hold
  from the animal's own state, which was set from the hold — a loop that fed
  itself, and an unattended herd walked off the map at two metres a second.
- **Steering returns a direction and an urgency.** Without the urgency, every
  state moved at its full speed in whatever direction the forces happened to
  sum to, and a grazing herd jittered.

---

## The number that decides whether the design works

Reagan stops counting as a calming presence for 2.6 seconds after each shot.

Without that line the brief's central claim is simply false. His aura restores
4.5 calm a second at close range; sustained rifle fire costs about 3.3 a second
to everything within fifteen metres. Standing still to shoot *maximises* the
aura — he is not sprinting, he is right there in the middle of them — so the
optimal play came out as "plant your feet in the herd and empty the magazine",
which is the exact opposite of the design.

Measured over three seeds on the Fern Flats, 600 seconds each:

| | delivered | lost | shots |
|---|---|---|---|
| Before | shooter 12 / 12 / 12 | 0 / 0 / 0 | 69 / 64 / 81 |
| After | shooter 7 / 8 / 3 | 5 / 4 / 2 | 47 / 337 / 602 |
| After | herder 11 / 11 / 11 | 1 / 1 / 1 | 0 / 0 / 0 |

A man working a stun rifle is not reassuring anybody. It is also the only
change here that is not in the brief — the brief pins the gunshot penalty and
says nothing about the restore rate, and the restore rate was mine.

---

## The goad had to be worth using

A shoved rex was staggered for 1.1 seconds and then walked straight back, which
made the goad strictly worse than the rifle — it bought two seconds against the
rifle's ten, for the price of standing within three metres of a tyrannosaur.

A goaded predator now backs off for **five seconds** before trying again. That
is what turns "you can technically use this" into the brief's "skilled players
should be able to goad a rex off the herd rather than shoot it". On the first
level the pacifist bot now completes the drive in 120 seconds with six of six
head, all in prime condition, having never fired.

It also runs from *Reagan*, not from the herd, so a well-placed goad puts the
animal between you and your stock. That is where the skill expression lives.

---

## Bone Gulch: a stampede you can actually steer

Two problems, both found by playing it.

The brief says a bolting animal ignores cohesion. The first implementation had
it ignore *everything*, including the player — so a stampede could only be
waited out, and the level's whole set piece was a cutscene. Panicked animals now
still feel Reagan's shove at reduced weight. They ignore the herd, ignore
grazing, and crucially ignore edge avoidance, which is what makes the drop
dangerous; but you can get out there and shoulder them off the edge line.

And the scripted stampede now forces `PANICKED` outright rather than nudging
calm below the threshold, because one well-timed whoop restores fifteen calm and
defused the entire set piece before it began. Bolting from zero calm means the
first whoop is not enough on its own.

The shelf was also 17 metres wide against a herd that spans about 20. Twelve
head were falling off by existing. It is 26 now; the stampede is the danger, not
the geometry.

---

## Things that were quietly eating the herd

Found by tracing full drives headless, not by reading the code:

- **Predators never left.** Nothing removed a raptor that could not take a head,
  so spawn waves accumulated until fifteen threats shared the Ash Plains. Every
  kind now has a patience — 105s for a rex, 68s for a raptor — after which it
  breaks off.
- **A wiped-out herd softlocked the drive.** No head left, gate two beacons
  away, nothing to end it. It now closes out as failed.
- **The map edge was a silent kill line.** A five-second bolt covers 44 metres,
  so a couple of panics near a boundary wrote animals off for reasons the player
  could not see. Animals now pull up at the edge and turn back.
- **Straggler retrieval was unusable.** A straggler being shoved by Reagan still
  moved at grazing pace, so fetching one animal cost the better part of a
  minute. Two levels simply never progressed. Being pushed now outranks having
  given up on the herd.
- **A matriarch handover could reverse the drive.** She was promoted purely on
  calm, which sometimes picked an animal that had drifted back down the trail —
  and the herd dutifully followed her home. She is now chosen from the head of
  the herd.

---

## Old One Eye

Her fight is one primitive: a dead white eye on her left side.

Stun shots to her body do nothing at all. The goad staggers her *only* from her
blind flank. Three shots to the exposed neck during a stagger completes one
phase, three phases puts her down, and the gate is shut until she is. Firing the
rifle makes a noise and she turns toward noise, so the rifle is actively
counterproductive until the neck is already open.

Nothing tells the player any of this. The teaching signal is that body shots
visibly and audibly do nothing, repeatedly, and the only thing left to try is
circling. Her left is her left in the maths *and* in the rig — `up × forward`,
a bearing of +π/2 — because if those two ever disagreed the only clue in the
game would be pointing at the wrong side.

---

## Art

Everything is boxes, spheres, cones and cylinders. Three things learned:

- **Inverted-hull outlining needs closed geometry.** The frill was an open
  hemisphere, so its "outline" was a solid black shell over the animal's face.
- **A head on a thin neck reads as a detached prop.** Both theropods run chest,
  neck and skull as a continuous chain of masses; the raptor and the nothosaur
  had to be rebuilt the same way.
- **Rounded masses first.** A barrel made of boxes reads as luggage no matter
  what you hang off it, and spheres cost the same.

Outline thickness is scaled by view depth to keep a constant screen width, but
**capped past sixty metres** — otherwise a distant rock is a dozen pixels across
and a constant-width line eats the whole shape, which turned the far treeline
into a solid black wall. Distant things lose their ink, which is also how the
printing worked.

Reagan gets a thinner line than the dinosaurs because his parts are a quarter of
a metre thick and the hull was escaping its own geometry, leaving a wireframe
box around him.

All of this was found on the turntable at `?rig=`, which is why the turntable
ships.

---

## Budget

Measured by `scripts/smoke.mjs` against the production build, on level one with
the full herd:

- **335 draw calls**, **166k triangles**, 13 programs, 31 geometries.
- The simulation steps twelve head and five predators in well under a
  millisecond of a 16.6ms frame.

The ground is 180×180 segments and the foliage is 1000 instanced ferns in one
draw call; both were cut back from higher numbers that looked no better. Outlines
are the main multiplier on draw calls — every silhouette-defining part is drawn
twice — which is why horns, studs, teeth and eyes do not get one.

Note that the frame rate itself has **not** been verified on real hardware. This
was built with software rendering, where nothing runs at sixty frames a second.
The budget is comfortable; somebody should still play it on a laptop.
