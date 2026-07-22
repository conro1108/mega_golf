# mega_golf — design notes

## What the genre is

Physics minigolf is a one-input game: aim a shot, set its power, release,
then watch physics resolve it. All skill lives in that single committed
input — reading angles, banks, slopes, and hazards before you shoot. The
loop is "one more try" shaped: a hole takes 15–60 seconds, failure is
instantly retryable, and the difference between a 5-stroke slog and an ace
is visible and learnable.

Reference points: Desert Golfing (side-view, radical minimalism, infinite
procedural course), Kirby's Dream Course / Zany Golf (top-down-ish, gimmick
holes), Golf It / What the Golf (physics comedy). The genre usually splits on
perspective — **side-view** (terrain silhouette, gravity is the star) vs
**top-down** (bank shots and layout are the star).

**We do both.** Perspective is a property of a *hole*, not of the game. See
"Two perspectives" below — this is the central structural decision and most
things downstream (physics, art, hole authoring, progression) follow from it.

## Core loop

- A **course** = ~9 handmade holes with a shared visual identity. Play a
  course in one sitting (~5–10 min) or drop in per-hole.
- Per hole: drag-to-aim slingshot input (angle + power in one gesture),
  release to putt. Ball rolls, bounces, settles. Repeat until it's in the
  cup. Strokes counted against **par**.
- No lives, no failure state — just your stroke count. The scorecard *is*
  the game: beating par, beating your best, beating your friends.
- Unlimited retries per hole feel right for casual play, but the *recorded*
  scorecard should be first-attempt-per-session so scores mean something.

## Two perspectives

The game contains **both** side-view and top-down holes — but they are
separated into **two courses you pick between on the title screen**, not
blended within one round. They remain two dialects of the same verb; what
changed is that you choose the dialect up front and stay in it.

> Revised after play-testing. The original plan alternated perspectives as a
> course progressed, and the finale switched lens mid-hole. In practice that
> read as *confusing* rather than as variety — you spend the first beat of
> every hole working out which game you're in. Perspective is now a property
> of a **course**. Both are on the front page, so nothing is hidden; the
> variety just lives one level up.

- **Side-view — "launch it."** Explicitly *skee-ball, not golf*. Rolling
  ground — tee knolls, valleys, hollows — but the ball still lives in an
  **arc**, not a roll: holes end in a drop-in **pocket** whose lip rejects a
  ball arriving along the ground, so the shot has to come down out of the
  air. A max launch carries about a screen and holes are sized to one or two
  arcs. Undershoot and you land in the trouble the valley holds — sand, a
  water basin, dead low ground — rather than falling out of the world.
- **Top-down — "bank it."** Gravity is gone; the floor holds the ball. Skill
  is banks, angles, and routing around hazards. The hole is a layout you read
  like a map. Slower, more deliberate, more "puzzle" than "throw".

### What stays identical

This is the important half. The player learns **one** verb and never relearns
it: drag back from the ball, release. Same slingshot gesture, same power
ramp, same stroke-and-par scoring, same scorecard, same recorded shot shape
`(hole_id, angle, power)` — so ghost putts work across both without a second
system. Perspective changes what you *read*, never how you *act*.

If a hole seems to want a different gesture, that is a signal the hole is
wrong, not that the input needs a mode.

### What legitimately differs

- **Camera** — side-view follows the ball mostly horizontally; top-down has
  to track both axes and wants more lead room.
- **Aim preview** — an arc in side-view, a straight line (eventually with a
  first-bank prediction) in top-down.
- **Art** — silhouette-and-sky vs. floor-plan-and-walls. Different tilesets,
  same palette discipline.
- **Pacing** — top-down holes take longer per stroke. Budget fewer of them.

### Progression

Each course is **nine holes plus its own mega finale**, and difficulty climbs
within its single perspective — harder geometry, meaner materials, tighter
windows. No hole ever switches lens on you.

Each course's **mega hole** is a sprawling finale *in that course's own
perspective*, with sub-cups partway that bank your progress. The side-view
one is a long chain of launches across every surface; the top-down one is a
serpentine floor of banks and blind corners. The old cross-perspective
handoff is gone with the blending that motivated it.

One deliberate exception per course keeps the vocabulary honest rather than
mechanical: the side course's **The Squeeze** is the hole with a ceiling too
low to arc under, so it's the one that forbids the launch and asks for a flat
drive into a cup sitting on the deck.

### Engine implication

**One simulation, not two.** Gravity becomes a per-hole vector: side-view is
`(0, +g)`, top-down is `(0, 0)` plus a global surface friction applied every
step (the ball is always in contact with the floor). Collision, materials,
resting, scoring, determinism, and ghost putts are all unchanged and shared.

Resist forking the engine per perspective — the moment there are two
simulations there are two sets of determinism guarantees, and the golden
fixture stops meaning anything.

## Physics

- 2D rigid ball vs. static terrain: gravity (per-hole, see above),
  restitution, rolling friction. Keep it simple and **deterministic** (fixed
  timestep) from day one — ghost putts (below) require that a recorded input
  replays identically.
- Surfaces as materials: green (normal), sand (kills momentum), ice (no
  friction), rubber (bouncy), water/void (stroke penalty + reset to last
  rest position).
- A few dynamic elements for late holes: moving platforms, fans, one-way
  gates. Each must be time-deterministic (position = f(hole_time)).

## Hole design principles

- Each hole teaches or twists **one idea**. Name the idea before building
  the hole; if you can't, cut it. "It's top-down" is not an idea — the
  perspective is a lens, not a gimmick, and a hole still has to justify
  itself within it.
- Every hole has a safe route (par via boring shots) and a greedy route
  (birdie/ace line with real miss punishment). The tension between them is
  the whole design.
- Par 3–5 per hole. If testing says par 6+, the hole is two holes.

## The "mega" hook

Every course ends in a **mega hole**: a sprawling, multi-screen finale —
5–10x the size of a normal hole, par 8+, checkpointed cups partway through
(sub-cups bank your progress). It's the boss level: the course's gimmicks
composed into one long ride. Normal holes are snacks; the mega hole is the
screenshot, the thing you tell a friend about, and the natural place for
scorecard rivalry to concentrate.

## Pixel art notes

- Low-res canvas scaled up to fill the screen; the camera follows the ball
  with soft leading. The buffer takes the window's aspect ratio at a constant
  pixel budget (480×270 landscape, ~245×530 on a portrait phone), so the game
  plays either way up rather than demanding a rotate. A hole smaller than the
  viewport on an axis is centred on it.
- Terrain as chunky tile/silhouette art (side-view) or floor-plan tiles with
  walls reading as short vertical faces (top-down); the ball gets the juice
  budget — trail, squash on impact, hitstop on hard bounces, screen shake on
  the ace, big chunky stroke counter.
- The two perspectives must look like the same game: shared palette, shared
  ball, shared HUD. A course's identity comes from its colours, not its
  camera.
- Course = palette. Same mechanics reskin cheaply: desert course, roof-top
  course, fridge-interior course. Palette swap + one new material per
  course keeps content cost linear.

## Async layer (later, but design for it now)

- **Scorecards**: per-course leaderboards among friends; a daily featured
  course everyone plays on the same holes.
- **Ghost putts**: because physics is deterministic, a shot is just
  (hole_id, aim vector, power, timestamp offset). Replay friends' shots as
  translucent ghost balls on your screen — near-zero storage, high social
  value. Record inputs from day one even before any online exists.

## Open questions

- **Does the perspective switch feel like variety or like whiplash?** The
  whole blend rests on this and it can't be settled on paper — build one
  top-down hole, sit it next to a side-view one, and play the pair.
- **Does the slingshot actually carry to top-down?** The claim above is that
  the input never changes. If top-down aiming turns out to want a longer,
  finer drag (small angle errors compound over a long bank), that's a real
  tension between "one verb" and "it feels good" — and feel probably wins.
- Ratio and ordering: how many top-down holes in a 9-hole course, and where
  does the first one land? Guess: 3 of 9, first at hole 4.
- Stroke cap per hole? (e.g., pick up at 2x par to keep sessions moving.)
- Aiming feel: pull-back slingshot (Desert Golfing) vs. aim-then-power-meter.
  Slingshot is one gesture and touch-friendly; started there.

## Not in scope for v1

Online anything (just record inputs locally), level editor, moving-camera
cutscenes, more than 2 courses. Ship 9 holes + 1 mega hole that feel great.

Both perspectives *are* in scope for v1 — the blend is the game, and a v1
that ships only side-view hasn't tested the actual idea. Start around 3
top-down of 9 and let playtesting move that number. The perspective-switching
mega hole is in scope too; it's the finale the course exists to reach.
