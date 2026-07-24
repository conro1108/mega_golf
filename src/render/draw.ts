/**
 * Canvas renderer. Everything here draws in world units — a ~480-wide
 * coordinate space whose scale onto real device pixels is baked into the
 * context transform by the caller, so shapes and text rasterise at the
 * display's native resolution. The viewport is not a fixed size: it takes the
 * window's aspect ratio (see `view.ts`), so screen-anchored UI reads `VIEW`
 * rather than hard-coding 480x270.
 */

import { BALL_RADIUS, CUP_RADIUS } from "../engine/bodies";
import type { Game } from "../engine/game";
import { speedOf } from "../engine/units";
import { DEFAULT_GRAVITY, isTopDown, terrainMaterialAt, type Hole, type MaterialId } from "../engine/world";
import { VIEW } from "./view";

/** How deep the side-view cup is cut into the green, in world units. */
const CUP_DEPTH = 11;
/** Frames the drop-in animation takes once the ball is holed. */
export const SINK_FRAMES = 18;

/** Mid-tone per material — the minimap silhouette and top-down floors. */
export const FILL: Record<MaterialId, string> = {
  green: "#3f7d46",
  sand: "#d3bc7c",
  ice: "#8fc9dd",
  rubber: "#b8477f",
};

/**
 * Side-view terrain is drawn as a dark *body* with a bright *surface band*
 * along its upward-facing edges only — earth under grass. Outlining a whole
 * polygon (the old treatment) put bright strokes down every vertical face and
 * every seam between abutting ground segments, which is most of why terrain
 * read as floating stickers rather than as land.
 */
const BODY: Record<MaterialId, string> = {
  green: "#2f4f36",
  sand: "#b39a62",
  ice: "#4f7d99",
  rubber: "#5d2746",
};

const TOP: Record<MaterialId, string> = {
  green: "#63b061",
  sand: "#eeddab",
  ice: "#c2ecf7",
  rubber: "#e06fa6",
};

function tracePolygon(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

/**
 * Same outline, but with corners rounded to a small radius (clamped so it
 * never overshoots a short edge). Collision still runs on the plain straight
 * polygon in `world.ts` — this only softens the fill, purely cosmetic, so
 * chunky rectangular terrain reads as chunky-but-not-blocky.
 */
function traceRoundedPolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  radius: number,
): void {
  const n = points.length;
  if (n < 3 || radius <= 0) {
    tracePolygon(ctx, points);
    return;
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const toPrevX = prev[0] - curr[0];
    const toPrevY = prev[1] - curr[1];
    const toNextX = next[0] - curr[0];
    const toNextY = next[1] - curr[1];
    const lenPrev = Math.sqrt(toPrevX * toPrevX + toPrevY * toPrevY);
    const lenNext = Math.sqrt(toNextX * toNextX + toNextY * toNextY);
    const r = Math.min(radius, lenPrev / 2, lenNext / 2);
    const p1x = curr[0] + (toPrevX / lenPrev) * r;
    const p1y = curr[1] + (toPrevY / lenPrev) * r;
    const p2x = curr[0] + (toNextX / lenNext) * r;
    const p2y = curr[1] + (toNextY / lenNext) * r;
    if (i === 0) ctx.moveTo(p1x, p1y);
    else ctx.lineTo(p1x, p1y);
    ctx.quadraticCurveTo(curr[0], curr[1], p2x, p2y);
  }
  ctx.closePath();
}

/**
 * Rounded where it helps, straight where it would hurt: hole content authors
 * a frame (or a divider) as several abutting thin rectangles — a top wall,
 * a left wall, and so on — that are meant to meet flush at a shared corner.
 * Rounding each one independently pulls every piece back from that shared
 * point and leaves a visible notch of background showing through at the
 * seam. So anything thinner than a couple of ball-widths keeps its sharp
 * corners; only genuinely chunky shapes (hills, floor fills, ponds) round.
 */
function traceShape(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  radius: number,
): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const thin = Math.min(maxX - minX, maxY - minY) < 12;
  if (thin) tracePolygon(ctx, points);
  else traceRoundedPolygon(ctx, points, radius);
}

/**
 * Where to draw the ball, and how big. Normally that's just its simulated
 * position — but once it's holed the renderer takes over and walks it from
 * wherever the capture caught it down to the bottom of the cup. The engine
 * can't do this itself: `holed` is terminal and the drop is cosmetic, so
 * keeping it here leaves replay determinism untouched.
 *
 * Exported for testing; `draw` is the only other caller.
 */
export function holedBallSprite(
  game: Game,
  cx: number,
  cy: number,
  topDown: boolean,
  sink: number,
): { x: number; y: number; r: number } {
  const b = game.ball.position;
  if (sink <= 0) return { x: b.x, y: b.y, r: BALL_RADIUS };
  const ease = sink * sink * (3 - 2 * sink);
  // Centres up first, then falls: a ball caught on the rim rolls to the middle
  // before it can go down, same as the real thing.
  const centre = Math.min(1, sink * 1.8);
  const x = b.x + (cx - b.x) * centre;
  if (topDown) {
    // No "down" to fall into from above — it shrinks away into the cup instead.
    return { x, y: b.y + (cy - b.y) * centre, r: BALL_RADIUS * (1 - 0.8 * ease) };
  }
  const floor = mouthY(cy) + CUP_DEPTH - BALL_RADIUS - 2;
  return { x, y: b.y + (floor - b.y) * ease, r: BALL_RADIUS };
}

/**
 * The mouth of the cup sits on the putting surface, and a cup coordinate is
 * authored where a ball *resting in it* would have its centre — i.e. one ball
 * radius above the ground. Drawing the mouth at the raw cup y floated the rim
 * above the grass.
 */
function mouthY(cy: number): number {
  return cy + BALL_RADIUS;
}

/** The lip colour of the cup is whatever the ball is putting on. */
function lipColours(hole: Hole, cx: number, cy: number): { top: string; fill: string } {
  const m = terrainMaterialAt(hole, cx, mouthY(cy) + 3, "green");
  return { top: TOP[m], fill: BODY[m] };
}

/** Cavity and back lip: everything behind the ball. */
function drawCupBack(ctx: CanvasRenderingContext2D, hole: Hole, cx: number, cy: number): void {
  const r = CUP_RADIUS;
  const my = mouthY(cy);
  const { top } = lipColours(hole, cx, cy);

  // The shaft. Walls taper slightly and the bottom carries a lighter ellipse,
  // so it recedes like a bore instead of reading as a black box punched into
  // the green.
  const br = r - 2;
  ctx.fillStyle = "#0b0912";
  ctx.beginPath();
  ctx.moveTo(cx - r, my);
  ctx.lineTo(cx - br, my + CUP_DEPTH);
  ctx.lineTo(cx + br, my + CUP_DEPTH);
  ctx.lineTo(cx + r, my);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#171326";
  ctx.beginPath();
  ctx.ellipse(cx, my + CUP_DEPTH, br, br * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // The mouth, an ellipse so the opening reads as a hole seen at an angle.
  ctx.beginPath();
  ctx.ellipse(cx, my, r, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Back lip catches the light.
  ctx.strokeStyle = top;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, my, r, r * 0.34, 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Flagstick, planted in the cup rather than floating above it.
  ctx.fillStyle = "#e8e4f0";
  ctx.fillRect(cx - 1, my - 26, 2, 26 + CUP_DEPTH - 3);
  ctx.fillStyle = "#f2d24b";
  ctx.beginPath();
  ctx.moveTo(cx + 1, my - 26);
  ctx.lineTo(cx + 15, my - 21);
  ctx.lineTo(cx + 1, my - 16);
  ctx.closePath();
  ctx.fill();
}

/** Front lip: the sliver of green between you and the hole, drawn over the ball. */
function drawCupFront(ctx: CanvasRenderingContext2D, hole: Hole, cx: number, cy: number): void {
  const r = CUP_RADIUS;
  const my = mouthY(cy);
  const { top, fill } = lipColours(hole, cx, cy);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, my, r, r * 0.34, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = top;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r, my);
  ctx.lineTo(cx + r, my);
  ctx.stroke();
}

/** From above the cup is a ring: dark bore, bright rim, flag in the middle. */
function drawTopDownCup(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = "#0b0912";
  ctx.beginPath();
  ctx.arc(cx, cy, CUP_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f2d24b";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "rgba(242, 210, 75, 0.35)";
  ctx.beginPath();
  ctx.arc(cx, cy, CUP_RADIUS - 2.5, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Render-only juice state, module-level because `draw` is called once a frame
 * and the sim deliberately knows nothing about presentation. Everything in
 * here is cosmetic: trails, impact rings, screen shake. Reset when the hole
 * changes so a trail can't smear across a load.
 */
const juice = {
  holeName: "",
  frame: 0,
  trail: [] as { x: number; y: number }[],
  puffs: [] as { x: number; y: number; age: number; big: boolean }[],
  shake: 0,
  prevHoled: false,
  prevContact: false,
  prevSpeed: 0,
};

function updateJuice(game: Game): void {
  if (juice.holeName !== game.hole.name) {
    juice.holeName = game.hole.name;
    juice.trail.length = 0;
    juice.puffs.length = 0;
    juice.shake = 0;
    juice.prevHoled = false;
    juice.prevContact = false;
  }
  juice.frame += 1;

  const b = game.ball.position;
  const speed = speedOf(game.ball.velocity);

  if (game.state === "moving") {
    juice.trail.push({ x: b.x, y: b.y });
    if (juice.trail.length > 9) juice.trail.shift();
  } else if (juice.trail.length > 0) {
    juice.trail.shift();
  }

  // A fresh hard contact leaves a little impact ring where the ball hit.
  if (game.contact && !juice.prevContact && juice.prevSpeed > 220) {
    juice.puffs.push({ x: b.x, y: b.y, age: 0, big: juice.prevSpeed > 400 });
    if (juice.prevSpeed > 400) juice.shake = Math.max(juice.shake, 4);
  }
  for (const p of juice.puffs) p.age += 1;
  while (juice.puffs.length > 0 && juice.puffs[0].age > 14) juice.puffs.shift();

  const holed = game.state === "holed";
  if (holed && !juice.prevHoled) juice.shake = 7;
  juice.prevHoled = holed;
  juice.prevContact = game.contact;
  juice.prevSpeed = speed;
  if (juice.shake > 0) juice.shake -= 0.6;
}

/**
 * Side-view backdrop: a dusk sky, a couple of stars, and layered parallax
 * hills behind the terrain, so an arc happens *somewhere* instead of in a
 * void. Pure cosmetics — sines and camera fractions never touch the game.
 */
function drawSky(
  ctx: CanvasRenderingContext2D,
  hole: Hole,
  camX: number,
  camY: number,
  zoom: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.h);
  sky.addColorStop(0, "#221b47");
  sky.addColorStop(0.55, "#33254e");
  sky.addColorStop(1, "#4c2f52");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  // A sparse fixed constellation, faintly parallaxed against the camera.
  ctx.fillStyle = "rgba(232, 228, 240, 0.5)";
  for (let i = 0; i < 26; i++) {
    const sx = ((i * 97 + 31) % 523) / 523;
    const sy = ((i * 57 + 13) % 331) / 331;
    const x = ((sx * VIEW.w * 1.6 - camX * 0.05) % VIEW.w + VIEW.w) % VIEW.w;
    const y = sy * VIEW.h * 0.55 - camY * 0.05;
    const r = i % 5 === 0 ? 1.1 : 0.6;
    ctx.fillRect(x, y, r, r);
  }

  // Hills, far to near. Anchored to world height so they sit behind the
  // ground band, scrolling at a fraction of the camera.
  const layers = [
    { color: "#2a2145", base: hole.height - 118, amp: 16, freq: 0.006, pf: 0.15, phase: 1.7 },
    { color: "#33284f", base: hole.height - 92, amp: 20, freq: 0.009, pf: 0.3, phase: 4.2 },
    { color: "#3d2c53", base: hole.height - 70, amp: 14, freq: 0.014, pf: 0.5, phase: 0.4 },
  ];
  for (const l of layers) {
    ctx.beginPath();
    ctx.moveTo(0, VIEW.h);
    for (let sx = 0; sx <= VIEW.w + 6; sx += 6) {
      const wx = camX * l.pf + sx / zoom;
      const wy = l.base + Math.sin(wx * l.freq + l.phase) * l.amp;
      ctx.lineTo(sx, (wy - camY) * zoom);
    }
    ctx.lineTo(VIEW.w, VIEW.h);
    ctx.closePath();
    ctx.fillStyle = l.color;
    ctx.fill();
  }
}

/**
 * The bright band along terrain's upward-facing edges — grass on earth. An
 * edge faces up when it runs left-to-right (polygons are wound clockwise in
 * y-down screen space). Runs of consecutive up-facing edges are stroked as
 * one polyline so corners join cleanly.
 */
function drawSurfaceBand(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const n = points.length;
  let run: (readonly [number, number])[] = [];
  const flush = () => {
    if (run.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(run[0][0], run[0][1]);
      for (let i = 1; i < run.length; i++) ctx.lineTo(run[i][0], run[i][1]);
      ctx.stroke();
    }
    run = [];
  };
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    // Up-facing and not a near-vertical face.
    if (dx > 0 && dx > Math.abs(dy) * 0.45) {
      if (run.length === 0) run.push(a);
      run.push(b);
    } else {
      flush();
    }
  }
  flush();
}

/** Water: a pool with a lighter surface line and a slow cosmetic shimmer. */
function drawWater(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  frame: number,
): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
  }
  traceShape(ctx, points, 10);
  ctx.fillStyle = "rgba(48, 98, 172, 0.85)";
  ctx.fill();
  ctx.save();
  traceShape(ctx, points, 10);
  ctx.clip();
  ctx.fillStyle = "rgba(126, 168, 224, 0.5)";
  ctx.fillRect(minX, minY, maxX - minX, 3);
  // Two drifting glints.
  ctx.fillStyle = "rgba(180, 208, 240, 0.35)";
  const t = frame * 0.02;
  for (let k = 0; k < 2; k++) {
    const gx = minX + ((Math.sin(t + k * 2.4) * 0.5 + 0.5) * (maxX - minX)) * 0.9;
    ctx.fillRect(gx, minY + 6 + k * 5, 10 - k * 3, 1.2);
  }
  ctx.restore();
}

/** Top-down: mow stripes, patterned zones, walls with cast shadows. */
// Floor variants, a step deeper than FILL: a full-screen sheet of the raw
// material colour (ice especially) glared like a different game next to the
// dusk side view. Same hues, lower volume.
const FLOOR: Record<MaterialId, string> = {
  green: "#3a6f41",
  sand: "#c3aa6c",
  ice: "#6da4bd",
  rubber: "#a4487c",
};

function drawTopDownWorld(ctx: CanvasRenderingContext2D, game: Game): void {
  const hole = game.hole;
  if (hole.floor !== undefined) {
    ctx.fillStyle = FLOOR[hole.floor];
    ctx.fillRect(0, 0, hole.width, hole.height);
    // Mow stripes: alternating faintly-lighter diagonal bands.
    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    const band = 44;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, hole.width, hole.height);
    ctx.clip();
    for (let x = -hole.height; x < hole.width; x += band * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + band, 0);
      ctx.lineTo(x + band + hole.height, hole.height);
      ctx.lineTo(x + hole.height, hole.height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  if (hole.zones) {
    for (const z of hole.zones) {
      if (z.floor === undefined) continue;
      traceShape(ctx, z.points, 8);
      ctx.fillStyle = FILL[z.floor];
      ctx.fill();
      ctx.save();
      traceShape(ctx, z.points, 8);
      ctx.clip();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [x, y] of z.points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (z.floor === "sand") {
        // Stippled, so sand reads as texture and not just "beige here".
        ctx.fillStyle = "rgba(120, 96, 48, 0.35)";
        for (let gy = Math.floor(minY / 9) * 9; gy < maxY; gy += 9) {
          for (let gx = Math.floor(minX / 9) * 9; gx < maxX; gx += 9) {
            const jx = ((gx * 7 + gy * 13) % 5) - 2;
            const jy = ((gx * 11 + gy * 3) % 5) - 2;
            ctx.fillRect(gx + jx, gy + jy, 1.4, 1.4);
          }
        }
      } else if (z.floor === "ice") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
          const off = minX + ((maxX - minX) * (k + 1)) / 4;
          ctx.beginPath();
          ctx.moveTo(off, minY);
          ctx.lineTo(off + (maxY - minY) * 0.4, maxY);
          ctx.stroke();
        }
      }
      ctx.restore();
      traceShape(ctx, z.points, 8);
      ctx.strokeStyle = "rgba(11, 9, 18, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  // Walls cast a small shadow onto the floor, which is what makes them read
  // as standing up out of it rather than painted on.
  ctx.save();
  ctx.translate(2.5, 3.5);
  ctx.fillStyle = "rgba(11, 9, 18, 0.35)";
  for (const t of hole.terrain) {
    traceShape(ctx, t.points, 6);
    ctx.fill();
  }
  ctx.restore();
  for (const t of hole.terrain) {
    traceShape(ctx, t.points, 6);
    ctx.fillStyle = BODY[t.material];
    ctx.fill();
    ctx.strokeStyle = TOP[t.material];
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** Side view: sky behind, earth-and-grass terrain, water in the dips. */
function drawSideWorld(ctx: CanvasRenderingContext2D, game: Game): void {
  for (const t of game.hole.terrain) {
    // No corner rounding here: ground is authored as abutting segments with
    // exact seams, and rounding pulls each corner back, opening a sliver of
    // sky at every seam. The surface band supplies the softness instead.
    tracePolygon(ctx, t.points);
    ctx.fillStyle = BODY[t.material];
    ctx.fill();
  }
  for (const t of game.hole.terrain) {
    drawSurfaceBand(ctx, t.points, TOP[t.material], 3.5);
  }
  if (game.hole.hazards) {
    for (const h of game.hole.hazards) drawWater(ctx, h.points, juice.frame);
  }
}

export function draw(
  ctx: CanvasRenderingContext2D,
  game: Game,
  camX: number,
  camY: number,
  ghost?: { x: number; y: number } | null,
  /** 0..1 progress of the holed drop-in animation; render-only, see `ball`. */
  sinkT = 0,
  /** World-to-screen scale. 1 is normal play; below 1 is the zoomed-out overview. */
  zoom = 1,
): void {
  updateJuice(game);
  const topDown = isTopDown(game.hole);

  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  if (!topDown) drawSky(ctx, game.hole, camX, camY, zoom);

  ctx.save();
  // Screen shake: a decaying alternating jolt, applied to the camera only.
  if (juice.shake > 0.5) {
    const j = juice.shake * 0.6;
    ctx.translate(juice.frame % 2 === 0 ? j : -j, juice.frame % 3 === 0 ? -j * 0.6 : j * 0.6);
  }
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  if (topDown) drawTopDownWorld(ctx, game);
  else drawSideWorld(ctx, game);

  // Checkpoints: a faint ring, filled in solid once banked.
  if (game.hole.checkpoints) {
    game.hole.checkpoints.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = game.checkpointsHit[i] ? "#f2d24b" : "rgba(242, 210, 75, 0.35)";
      ctx.fill();
    });
  }

  // Cup. Drawn in two passes with the ball sandwiched between them, so the
  // ball genuinely drops *into* the hole instead of parking beside a dark
  // smudge: the cavity and the back lip go down first, the front lip goes on
  // top and occludes whatever has fallen below the rim.
  const [cx, cy] = game.hole.cup;
  const sink = game.state === "holed" ? sinkT : 0;
  const drop = holedBallSprite(game, cx, cy, topDown, sink);

  if (topDown) drawTopDownCup(ctx, cx, cy);
  else drawCupBack(ctx, game.hole, cx, cy);

  // Ghost: a past best run, replaying underneath the live ball.
  if (ghost) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Impact rings, under the ball.
  for (const p of juice.puffs) {
    const t = p.age / 14;
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.5 * (1 - t)).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2 + t * (p.big ? 14 : 8), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Shadow on the ground straight below an airborne ball — the single
  // biggest aiming aid a side-view launch game can draw.
  if (!topDown && game.state === "moving" && !game.contact) {
    const gy = groundYBelow(game, drop.x, drop.y);
    if (gy !== null) {
      const h = gy - drop.y;
      const fade = Math.max(0, 1 - h / 260);
      if (fade > 0.05) {
        ctx.fillStyle = `rgba(11, 9, 18, ${(0.35 * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(drop.x, gy, 3.5 + h * 0.012, 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Trail, oldest-faintest.
  for (let i = 0; i < juice.trail.length; i++) {
    const t = juice.trail[i];
    const a = ((i + 1) / juice.trail.length) * 0.3;
    const r = BALL_RADIUS * (0.4 + (0.5 * (i + 1)) / juice.trail.length);
    ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ball.
  if (drop.r > 0.2) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(23, 19, 38, 0.25)";
    ctx.beginPath();
    ctx.arc(drop.x + drop.r * 0.3, drop.y + drop.r * 0.35, drop.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(drop.x - drop.r * 0.3, drop.y - drop.r * 0.35, drop.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!topDown) drawCupFront(ctx, game.hole, cx, cy);

  // Zoomed out, the ball and the cup are a pixel or two across and impossible
  // to pick out of the terrain. Ring them at a constant *screen* size — hence
  // dividing by zoom — so the overview still answers "where am I, where's the
  // hole" at a glance.
  if (zoom < 0.9) {
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, 7 / zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#f2d24b";
    ctx.beginPath();
    ctx.arc(cx, cy, 7 / zoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The terrain surface directly below a point, walked straight off the hole's
 * authored polygons.
 *
 * This deliberately doesn't ask Matter (a `Query.ray` against the world would
 * also answer it): it's the ball's drop shadow, it runs once a frame, and
 * reading the same points the terrain is *drawn* from keeps the shadow glued
 * to the silhouette rather than to the decomposed collision hull.
 */
function groundYBelow(game: Game, x: number, y: number): number | null {
  let best: number | null = null;
  for (const t of game.hole.terrain) {
    const pts = t.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const lo = Math.min(a[0], b[0]);
      const hi = Math.max(a[0], b[0]);
      if (x < lo || x > hi || a[0] === b[0]) continue;
      const ey = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      if (ey > y && (best === null || ey < best)) best = ey;
    }
  }
  return best;
}

/**
 * Slingshot preview. Side view gets the first stretch of the actual ballistic
 * arc as fading dots — enough to read launch shape, deliberately cut off well
 * before the landing so judging the carry stays the skill. Top-down gets a
 * straight strip the same way. Cosmetic: nothing here feeds the game.
 */
export function drawAim(
  ctx: CanvasRenderingContext2D,
  game: Game,
  camX: number,
  camY: number,
  angle: number,
  power: number,
  maxPower: number,
  zoom = 1,
): void {
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  const bx = game.ball.position.x;
  const by = game.ball.position.y;
  const t = power / maxPower;
  const color = t > 0.85 ? "#ff5d5d" : t > 0.5 ? "#f2d24b" : "#7de08a";

  const g = game.hole.gravity ?? DEFAULT_GRAVITY;
  const vx = Math.cos(angle) * power;
  const vy = Math.sin(angle) * power;

  const dots = 9;
  // Preview horizon: ~a third of a full arc's flight at max power, scaled a
  // little by how hard this shot is drawn so a tap doesn't fling dots.
  const horizon = 0.14 + 0.3 * t;
  for (let i = 1; i <= dots; i++) {
    const tt = (i / dots) * horizon;
    const px = bx + vx * tt;
    const py = by + vy * tt + 0.5 * g[1] * tt * tt;
    const fade = 0.85 * (1 - (i / dots) * 0.75);
    ctx.fillStyle = color;
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.arc(px, py, 1.9 - (i / dots) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Power ring around the ball: how much of the sling is drawn.
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(bx, by, BALL_RADIUS + 3.5, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
/**
 * The bottom of the title screen: layered hills, a flag, a ball waiting on the
 * tee. Purely decorative, and drawn from the same palette the holes use so the
 * menu looks like it belongs to the game rather than in front of it.
 */
function drawScenery(ctx: CanvasRenderingContext2D, horizonY: number, time: number): void {
  // Same dusk-hills-then-course palette the holes render with, so the menu
  // reads as the game seen from a distance rather than a screen in front of it.
  const layers = [
    { fill: "#33284f", top: "#3d2f5a", base: horizonY + 6, amp: 9, freq: 0.021, phase: 0.6 },
    { fill: "#3d2c53", top: "#4a355f", base: horizonY + 26, amp: 12, freq: 0.014, phase: 2.1 },
    { fill: "#2f4f36", top: "#63b061", base: horizonY + 52, amp: 8, freq: 0.026, phase: 4.3 },
  ];

  for (const l of layers) {
    ctx.beginPath();
    ctx.moveTo(0, VIEW.h);
    for (let x = 0; x <= VIEW.w; x += 4) {
      ctx.lineTo(x, l.base + Math.sin(x * l.freq + l.phase) * l.amp);
    }
    ctx.lineTo(VIEW.w, VIEW.h);
    ctx.closePath();
    ctx.fillStyle = l.fill;
    ctx.fill();
    ctx.strokeStyle = l.top;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Flag on the middle ridge, pennant breathing on a slow sine — the one
  // moving thing on an otherwise still screen, which is what sells it as alive.
  const mid = layers[1];
  const fx = Math.round(VIEW.w * 0.76);
  const fy = mid.base + Math.sin(fx * mid.freq + mid.phase) * mid.amp;
  ctx.fillStyle = "#e8e4f0";
  ctx.fillRect(fx - 1, fy - 30, 2, 30);
  const wave = Math.sin(time * 2.2) * 2;
  ctx.fillStyle = "#f2d24b";
  ctx.beginPath();
  ctx.moveTo(fx + 1, fy - 30);
  ctx.quadraticCurveTo(fx + 9, fy - 27 + wave, fx + 16, fy - 25);
  ctx.lineTo(fx + 1, fy - 20);
  ctx.closePath();
  ctx.fill();

  // Ball, teed up on the near ridge.
  const near = layers[2];
  const bx = Math.round(VIEW.w * 0.2);
  const by = near.base + Math.sin(bx * near.freq + near.phase) * near.amp;
  ctx.fillStyle = "rgba(11, 9, 18, 0.35)";
  ctx.beginPath();
  ctx.ellipse(bx, by, 4, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(bx, by - 3, 3, 0, Math.PI * 2);
  ctx.fill();
}


/**
 * The title screen's backdrop, drawn on its own canvas behind the React menu.
 *
 * The menu itself is DOM now, but the dusk sky and hills are not chrome — they
 * are the same palette the holes render with, and they are what make the menu
 * read as the game seen from a distance rather than a screen in front of it.
 * So they stay here, on a canvas, with the UI layered over them.
 */
export function drawTitleBackdrop(ctx: CanvasRenderingContext2D, time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.h);
  sky.addColorStop(0, "#221b47");
  sky.addColorStop(0.55, "#33254e");
  sky.addColorStop(1, "#4c2f52");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  drawScenery(ctx, VIEW.h * 0.62, time);
}
