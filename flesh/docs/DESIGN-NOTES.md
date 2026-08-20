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

## Bugs the end-to-end test found

The unit tests prove the simulation and the smoke test proves the game boots.
Neither touches the parts in between, and that is where these were hiding.

**The pause menu was unusable.** The input manager stayed attached behind the
overlay, so its mousedown handler grabbed pointer lock the instant you pressed
a button — which moved the cursor out from under the mouseup, so the click never
completed and the button did nothing. Input is now silenced whenever any
overlay is up: a click on a button is a click on a button.

**Resuming bounced straight back to pause.** Chrome refuses to re-enter pointer
lock for a moment after the user leaves it with Escape, and the refusal arrives
as a lock-change with a null element — indistinguishable from the player
alt-tabbing away. There is now a grace window after a deliberate resume, and the
request is retried twice.

**Resuming re-showed the briefing.** The level-start effect was keyed on the
screen becoming 'playing', which happens every time you come back from the
pause menu, not just when a new drive starts. It is keyed on the world now.

**A dropped completion event would strand you forever.** The end of a drive was
announced only by an event; if that event were ever missed the player would be
left standing in a world that had already finished with no way out. The phase is
now watched directly — the event is the notice, not the truth.

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

## The graphics pass

The first playable build looked like a flat orange void with brown boxes in it.
Six things fixed that, in rough order of how much difference each made:

**Shadows.** Nothing cast one, so everything floated. Real shadow maps from the
key light, on a 62-metre frustum that follows the player — a frustum wide
enough to cover a six-hundred-metre level would put a 2048 map at a texel every
thirty centimetres and the shadows would be mush. Inverted-hull outlines never
cast: they are a size larger than the thing they outline and would throw a
shadow that does not fit its own animal.

**Three-band shading that is actually three bands.** The gradient ramp was
96/108/255 — the dark and mid bands within eight per cent of each other, so in
practice a two-band ramp with a cliff, and anything facing away from the key
went to mud. Evenly spread at 96/172/255, with ambient dropped from 1.0 to
0.46, a rounded animal reads as rounded. A cool rim light from behind does the
rest: on a banded ramp a back light produces a hard-edged rim for free, and it
is what separates a brown dinosaur from brown ground at forty metres.

**A horizon.** A ring of mesas and buttes outside the bounds, in three
proportions — mostly broad flat-topped mesas, some buttes, the odd spire —
because a ring of identical cones reads as a row of tents. They opt out of the
scene fog and are hazed by hand, since at the fog density the levels use
anything past two hundred and fifty metres is already fog-coloured and would be
invisible by definition.

**Terrain that erodes.** Plain fbm gives rolling dunes, which is the wrong
landscape entirely. Ridged noise sharpens the crests and quantising the result
into terraces gives the benches and risers that read as erosion. All of it is
kept off the graded trail, which has to stay walkable.

**Vegetation with a mix in it.** One kind of fern scattered evenly is a
texture; five kinds with different heights and silhouettes are a place. Ferns,
cycads, horsetails, scrub, and dead snags — the snags being the treeline Reagan
keeps telling you not to turn your back on, and without something tall the
horizon has nothing for a rex to come out of.

**Ground you can see.** The vertex mottling works at landscape scale, but the
mesh has a vertex every two and a half metres, so within ten metres of the
camera the ground was smooth paint. One 128px tile, multiplied over the vertex
colour and mipmapped away at distance, fixed it for a single texture and no
draw calls. It has to stay close to white: the first version had real contrast
in it and read as a visible repeating pattern instead of as grain.

Three smaller ones worth recording:

- **Per-individual colour.** Twelve animals sharing one hex value read as twelve
  copies of one animal. A narrow hue and lightness jitter keyed off the id costs
  nothing — the toon material caches per colour.
- **Each level keeps its own palette.** The mottling derived its highlight and
  shadow from the shared palette, mixing the level's ground colour up to seventy
  per cent toward the same orange before it reached the screen. The Ash Plains
  rendered as more badlands. Both ends of the sky gradient are per-level now
  too, not just the top.
- **Carver City and Base 3 exist.** The strip's whole visual joke is corporate
  cleanliness sitting wrong against the badlands, and it only lands if the
  corporation has buildings in it. Without them the first and last levels began
  and ended in empty desert with a signpost.

### The water was not there

The Tar Shallows crossing had no water in it at all, and the cause was two
compounding mistakes. The surface height was anchored to a single sample on the
basin rim, where the underlying noise runs several metres off the centre — so
on this seed the "surface" came out below the basin floor. And the basin
shallowed from 55% of its radius outward while the surface disc was drawn at
the full radius, so most of that disc sat a few centimetres above dry ground.
The drawn disc and the carved basin have to agree.

While fixing it: anything in water deeper than its draft now floats rather than
walking along the bottom, because a triceratops crossing a five-metre pool used
to vanish under the surface and reappear on the far bank.

### Cost

Draw calls went from ~360 to ~1,050 before any of it was paid for. Most of that
was the shadow pass: `Part` cast from every piece, and a herd animal is about
twenty pieces. Casting only from the pieces that already carry an outline — the
ones that define the silhouette — halved it. Horns, teeth, eyes, studs and
stripes contribute nothing a shadow map can resolve.

---

## Budget

Measured by `scripts/smoke.mjs` against the production build, on level one with
the full herd:

- **440–900 draw calls** and **around 500k triangles**, depending on the level
  and where the player is standing. 18 programs, 40 geometries, 6 textures.
- The simulation steps twelve head and five predators in well under a
  millisecond of a 16.6ms frame.

The ground is 180×180 segments and each plant species is a single instanced
draw call whatever its count; both were cut back from higher numbers that looked
no better. Outlines are the main multiplier on draw calls — every
silhouette-defining part is drawn twice, and the shadow pass draws it a third
time — which is why horns, studs, teeth and eyes get neither.

Note that the frame rate itself has **not** been verified on real hardware. This
was built with software rendering, where nothing runs at sixty frames a second.
The budget is comfortable; somebody should still play it on a laptop.
