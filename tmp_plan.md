# mega_golf — design notes (draft)

## What the genre is

Physics minigolf is a one-input game: aim a shot, set its power, release,
then watch physics resolve it. All skill lives in that single committed
input — reading angles, banks, slopes, and hazards before you shoot. The
loop is "one more try" shaped: a hole takes 15–60 seconds, failure is
instantly retryable, and the difference between a 5-stroke slog and an ace
is visible and learnable.

Reference points: Desert Golfing (side-view, radical minimalism, infinite
procedural course), Kirby's Dream Course / Zany Golf (top-down-ish, gimmick
holes), Golf It / What the Golf (physics comedy). The genre splits on
perspective — **side-view** (terrain silhouette, gravity is the star) vs
**top-down** (bank shots and layout are the star). This is decision #1;
everything downstream (physics, art, hole authoring) depends on it.

Proposed default: **side-view**, Desert Golfing-style but with handmade
holes. It's the best fit for pixel art (terrain reads as a silhouette),
the physics is simpler (2D circle vs. static terrain), and gravity makes
even a flat hole interesting.

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

## Physics

- 2D rigid ball vs. static terrain: gravity, restitution, rolling friction.
  Keep it simple and **deterministic** (fixed timestep) from day one —
  ghost putts (below) require that a recorded input replays identically.
- Surfaces as materials: green (normal), sand (kills momentum), ice (no
  friction), rubber (bouncy), water/void (stroke penalty + reset to last
  rest position).
- A few dynamic elements for late holes: moving platforms, fans, one-way
  gates. Each must be time-deterministic (position = f(hole_time)).

## Hole design principles

- Each hole teaches or twists **one idea**. Name the idea before building
  the hole; if you can't, cut it.
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

- Fixed low-res canvas, integer-scaled (e.g., 480×270 for wider holes;
  camera follows the ball with soft leading).
- Terrain as chunky tile/silhouette art; the ball gets the juice budget —
  trail, squash on impact, hitstop on hard bounces, screen shake on the
  ace, big chunky stroke counter.
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

- Side-view vs. top-down — prototype side-view first, but kill the question
  with a playable toy, not debate.
- Aiming feel: pull-back slingshot (Desert Golfing) vs. aim-then-power-meter.
  Slingshot is one gesture and touch-friendly; start there.
- Stroke cap per hole? (e.g., pick up at 2x par to keep sessions moving.)
- Engine/platform: web-first fits the async layer and short sessions.

## Not in scope for v1

Online anything (just record inputs locally), level editor, moving-camera
cutscenes, more than 2 courses. Ship 9 holes + 1 mega hole that feel great.
