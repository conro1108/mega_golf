# CLAUDE.md

mega_golf is a mobile-first pixel-art physics minigolf game (static, deployed
on Vercel). Side-view, drag-to-aim slingshot, handmade holes. Every course ends
in a **mega hole** — a sprawling multi-screen finale. `tmp_plan.md` is the
design source of truth.

TypeScript + Vite, no framework. `src/engine/` is pure DOM-free simulation,
`src/render/` draws to canvas, `src/main.ts` is input and the frame loop.
Tests are Vitest, colocated as `*.test.ts`.

`npm run dev` / `npm test` / `npm run build`.

## Determinism — hard rule

Ghost putts replay a recorded `(angle, power)` and must land on the same pixel
everywhere, so `src/engine/` is restricted to IEEE-754-exact math: `+ - * /`
and `Math.sqrt`. No `Math.exp`/`pow`/`hypot`/`random`, no wall-clock time, no
iteration over unordered collections. Friction uses linear decay for this
reason — don't "fix" it to an exponential. The simulation only ever advances
in whole `DT` steps; never scale a step by frame time.

Record every shot from day one, even with no online layer — that data is the
entire ghost-putt feature.

## Git

This project merges straight to `main` — no feature branches or PRs.

Always commit and push after completing a piece of work, without asking for
confirmation first.
