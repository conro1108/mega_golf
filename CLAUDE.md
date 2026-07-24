# CLAUDE.md

mega_golf is a mobile-first pixel-art physics minigolf game (static, deployed
on Vercel). Side-view, drag-to-aim slingshot, handmade holes. Every course ends
in a **mega hole** — a sprawling multi-screen finale. `DESIGN.md` is the
design source of truth.

TypeScript + Vite. Physics is **Matter.js**, used natively — no wrapper layer,
no shadow physics API. React owns the shell (title, scorecard, HUD); the play
surface is a canvas driven by plain TypeScript. Tests are Vitest, colocated as
`*.test.ts`.

`npm run dev` / `npm test` / `npm run build`.

## Layout

- `src/engine/world.ts` — what a hole is made of. `MATERIALS` are Matter body
  options, so a surface's feel is one entry in one table.
- `src/engine/bodies.ts` — the only place a collider is constructed. Terrain
  polygons become static bodies; cup, checkpoints and hazards become sensors.
- `src/engine/units.ts` — world units/seconds <-> Matter's units. Read this
  before touching any number that has a unit.
- `src/engine/game.ts` — a hole in progress: a Matter engine plus the rules of
  minigolf, hung off Matter's own event stream.
- `src/session.ts` — canvas, camera, pointer input, frame loop.
- `src/ui/` — React shell. `src/render/` — canvas drawing.

## Matter.js — the things that bite

**Velocity is not per tick.** `body.velocity` is normalised to a 1/60s base
delta whatever the tick rate, as is `frictionAir`, while positions and forces
integrate at the real delta. Mixing those up reads every speed in the game as
double. Go through `speedOf`/`lieDrag` in `units.ts` rather than converting by
hand.

**Forces are cleared at the end of every `Engine.update`,** after collision
events fire. Anything that pushes the ball belongs in `beforeUpdate`; a
collision handler can only record that it should happen.

**Don't mutate position mid-solve.** Hazard and out-of-bounds resets are queued
by the collision event and carried out in `afterUpdate`.

**Contacts combine from both bodies** — `min` for friction, `max` for
restitution and static friction. The ball is deliberately built neutral
(friction 1, restitution 0, frictionStatic 0) so the surface decides
everything. Don't give the ball material properties.

**A Matter circle has no rolling resistance** and will roll forever on a flat
plane. `Material.rollingFriction` — applied as the ball's `frictionAir` from
whatever is under it — is the only reason the ball ever stops.

**There is no CCD.** The 120Hz tick in `units.ts` is what stops a 3-unit ball
at 540 units/sec tunnelling through an 8-unit wall. Lowering it will silently
break the top-down course.

## Ghost putts

A recorded shot is still `(angle, power)` and every shot is still recorded —
that data is the entire ghost-putt feature, so keep recording it even with no
online layer. But Matter is an iterative solver: a replay is *close*, not
pixel-exact, and not guaranteed identical across machines. Don't write a test
that pins exact coordinates; pin behaviour instead (see
`src/engine/game.test.ts`). Bump the epoch in `persistence.ts` when physics
tuning changes, so stale bests are ignored rather than replayed as nonsense.

## Git

This project merges straight to `main` — no feature branches or PRs.

Always commit and push after completing a piece of work, without asking for
confirmation first.
