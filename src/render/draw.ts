/**
 * Canvas renderer. Everything here draws in world units — a ~480-wide
 * coordinate space whose scale onto real device pixels is baked into the
 * context transform by the caller, so shapes and text rasterise at the
 * display's native resolution. The viewport is not a fixed size: it takes the
 * window's aspect ratio (see `view.ts`), so screen-anchored UI reads `VIEW`
 * rather than hard-coding 480x270.
 */

import { BALL_RADIUS, CUP_RADIUS, type Sim } from "../engine/sim";
import { isTopDown, terrainMaterialAt, type Hole, type MaterialId } from "../engine/world";
import { VIEW } from "./view";

/** How deep the side-view cup is cut into the green, in world units. */
const CUP_DEPTH = 11;
/** Frames the drop-in animation takes once the ball is holed. */
export const SINK_FRAMES = 18;

export const FILL: Record<MaterialId, string> = {
  green: "#3f7d46",
  sand: "#d3bc7c",
  ice: "#8fc9dd",
  rubber: "#b8477f",
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
  sim: Sim,
  cx: number,
  cy: number,
  topDown: boolean,
  sink: number,
): { x: number; y: number; r: number } {
  const b = sim.ball;
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
  return { top: TOP[m], fill: FILL[m] };
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

export function draw(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  camX: number,
  camY: number,
  ghost?: { x: number; y: number } | null,
  /** 0..1 progress of the holed drop-in animation; render-only, see `ball`. */
  sinkT = 0,
  /** World-to-screen scale. 1 is normal play; below 1 is the zoomed-out overview. */
  zoom = 1,
): void {
  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  // Floor: a zone (or the whole hole) can override gravity to zero and name a
  // floor material instead of terrain — that's the entire top-down mechanism
  // (see world.ts `Zone`), but a zone is physics-only and was never drawn, so
  // the ground under the ball's feet was just empty background. Fill it in
  // first, underneath terrain, so every floor material — and every friction
  // the player is about to feel — has a visible colour.
  if (sim.hole.floor !== undefined) {
    ctx.fillStyle = FILL[sim.hole.floor];
    ctx.fillRect(0, 0, sim.hole.width, sim.hole.height);
  }
  if (sim.hole.zones) {
    for (const z of sim.hole.zones) {
      if (z.floor === undefined) continue;
      traceShape(ctx, z.points, 8);
      ctx.fillStyle = FILL[z.floor];
      ctx.fill();
    }
  }

  for (const t of sim.hole.terrain) {
    traceShape(ctx, t.points, 6);
    ctx.fillStyle = FILL[t.material];
    ctx.fill();
    ctx.strokeStyle = TOP[t.material];
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Water hazards aren't colliders, so they're drawn as an overlay rather
  // than alongside terrain — a translucent pool sitting on top of whatever's
  // beneath it (usually nothing, but see the mega hole's shaft mouth).
  if (sim.hole.hazards) {
    ctx.fillStyle = "rgba(43, 92, 168, 0.75)";
    for (const h of sim.hole.hazards) {
      traceShape(ctx, h.points, 10);
      ctx.fill();
    }
  }

  // Checkpoints: a faint ring, filled in solid once banked.
  if (sim.hole.checkpoints) {
    sim.hole.checkpoints.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = sim.checkpointsHit[i] ? "#f2d24b" : "rgba(242, 210, 75, 0.35)";
      ctx.fill();
    });
  }

  // Cup. Drawn in two passes with the ball sandwiched between them, so the
  // ball genuinely drops *into* the hole instead of parking beside a dark
  // smudge: the cavity and the back lip go down first, the front lip goes on
  // top and occludes whatever has fallen below the rim.
  const [cx, cy] = sim.hole.cup;
  const topDown = isTopDown(sim.hole);
  const sink = sim.state === "holed" ? sinkT : 0;
  const drop = holedBallSprite(sim, cx, cy, topDown, sink);

  if (topDown) drawTopDownCup(ctx, cx, cy);
  else drawCupBack(ctx, sim.hole, cx, cy);

  // Ghost: a past best run, replaying underneath the live ball.
  if (ghost) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ball.
  if (drop.r > 0.2) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!topDown) drawCupFront(ctx, sim.hole, cx, cy);

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

/** Slingshot preview: the pull-back line plus a dotted power ramp. */
export function drawAim(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
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

  const bx = sim.ball.x;
  const by = sim.ball.y;
  const len = 12 + (power / maxPower) * 46;
  const ex = bx + Math.cos(angle) * len;
  const ey = by + Math.sin(angle) * len;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  const t = power / maxPower;
  ctx.fillStyle = t > 0.85 ? "#ff5d5d" : t > 0.5 ? "#f2d24b" : "#7de08a";
  ctx.beginPath();
  ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Bottom-left corner button, always available while playing. Recomputed per use: the viewport resizes. */
function homeButton(): { x: number; y: number; w: number; h: number } {
  return { x: 6, y: VIEW.h - 18, w: 40, h: 13 };
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  opts: {
    name: string;
    par: number;
    strokes: number;
    holed: boolean;
    holeNumber: number;
    holeCount: number;
    /** Strokes-to-par across holes already completed this round, or null before any. */
    roundToPar: number | null;
    isNewBest: boolean;
    /** Side-view vs. top-down: the two perspectives can look similar at a glance otherwise. */
    topDown: boolean;
  },
): void {
  ctx.fillStyle = "#ffffff";
  ctx.font = "10px monospace";
  ctx.textBaseline = "top";
  ctx.fillText(`${opts.holeNumber}/${opts.holeCount} ${opts.name}`, 6, 6);
  ctx.font = "16px monospace";
  ctx.fillText(`${opts.strokes}`, 6, 18);
  ctx.font = "10px monospace";
  ctx.fillStyle = "#9d94b8";
  ctx.fillText(`par ${opts.par}`, 22, 24);

  // Perspective badge: which of the two games this hole is playing right now.
  ctx.font = "8px monospace";
  ctx.fillStyle = opts.topDown ? "#f2d24b" : "#8fc9dd";
  ctx.fillText(opts.topDown ? "▦ TOP-DOWN" : "▤ SIDE VIEW", 6, 36);

  // Home button: the only way back to the title screen from mid-round.
  const home = homeButton();
  ctx.fillStyle = "rgba(23, 19, 38, 0.85)";
  ctx.fillRect(home.x, home.y, home.w, home.h);
  ctx.strokeStyle = "#9d94b8";
  ctx.lineWidth = 1;
  ctx.strokeRect(home.x, home.y, home.w, home.h);
  ctx.fillStyle = "#ffffff";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("⌂ MENU", home.x + home.w / 2, home.y + 3);
  ctx.textAlign = "left";

  ctx.textAlign = "right";
  ctx.fillStyle = "#9d94b8";
  ctx.font = "9px monospace";
  const roundLabel =
    opts.roundToPar === null ? "round: —" : `round: ${opts.roundToPar > 0 ? "+" : ""}${opts.roundToPar || "E"}`;
  ctx.fillText(roundLabel, VIEW.w - 6, 6);
  ctx.textAlign = "left";

  if (opts.holed) {
    const d = opts.strokes - opts.par;
    const label = d < -1 ? "EAGLE" : d === -1 ? "BIRDIE" : d === 0 ? "PAR" : d === 1 ? "BOGEY" : `+${d}`;
    ctx.fillStyle = "#f2d24b";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, VIEW.w / 2, VIEW.h / 2 - 20);
    ctx.font = "9px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("tap for next hole", VIEW.w / 2, VIEW.h / 2 + 2);
    if (opts.isNewBest) {
      ctx.fillStyle = "#7de08a";
      ctx.fillText("new best — ghost updated", VIEW.w / 2, VIEW.h / 2 + 14);
    }
    ctx.textAlign = "left";
  }
}

/**
 * Title-screen geometry, derived from the current viewport so the same code
 * lays out a wide landscape screen and a narrow portrait one. Shared by
 * `drawTitle` and `titleHitTest` — they used to carry duplicate magic numbers,
 * which is exactly the sort of thing that silently drifts once it can change.
 *
 * The block is centred in the space above the horizon rather than pinned to
 * fixed offsets from the top: on a tall phone that left the bottom 45% of the
 * screen as dead black, which is what made the entry screen read as unfinished.
 */
export interface TitleLayout {
  titleY: number;
  subY: number;
  barX: number;
  barY: number;
  barW: number;
  barH: number;
  playX: number;
  playY: number;
  playW: number;
  playH: number;
  pickY: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  gridTop: number;
  gridLeft: number;
  /** Top of the scenery band along the bottom edge. */
  horizonY: number;
}

const TITLE_BLOCK = 40;
const BAR_BLOCK = 22;
const PLAY_BLOCK = 34;
const PICK_BLOCK = 18;

export function titleLayout(holeCount: number): TitleLayout {
  const playW = Math.min(160, VIEW.w - 40);
  const playH = 26;
  // Fewer, narrower columns as the screen narrows; a 6-wide grid needs ~440px.
  const cols = VIEW.w >= 420 ? 6 : VIEW.w >= 300 ? 4 : 3;
  const cellW = Math.min(78, Math.floor((VIEW.w - 12) / cols));
  const cellH = 28;
  const rows = Math.ceil(holeCount / cols);

  const horizonY = Math.round(VIEW.h - Math.min(104, VIEW.h * 0.22));
  const contentH = TITLE_BLOCK + BAR_BLOCK + PLAY_BLOCK + PICK_BLOCK + rows * cellH;
  const top = Math.max(6, Math.round((horizonY - contentH) / 2));

  const barW = playW;
  return {
    titleY: top,
    subY: top + 24,
    barX: Math.round(VIEW.w / 2 - barW / 2),
    barY: top + TITLE_BLOCK,
    barW,
    barH: 4,
    playX: Math.round(VIEW.w / 2 - playW / 2),
    playY: top + TITLE_BLOCK + BAR_BLOCK,
    playW,
    playH,
    pickY: top + TITLE_BLOCK + BAR_BLOCK + PLAY_BLOCK,
    cols,
    rows,
    cellW,
    cellH,
    gridTop: top + TITLE_BLOCK + BAR_BLOCK + PLAY_BLOCK + PICK_BLOCK,
    gridLeft: Math.round(VIEW.w / 2 - (cols * cellW) / 2),
    horizonY,
  };
}

/** The cell a hole occupies in the select grid. Exported so tests can aim at one. */
export function titleCellRect(
  i: number,
  holeCount: number,
): { x: number; y: number; w: number; h: number } {
  const { cols, cellW, cellH, gridTop, gridLeft } = titleLayout(holeCount);
  return {
    x: gridLeft + (i % cols) * cellW,
    y: gridTop + Math.floor(i / cols) * cellH,
    w: cellW,
    h: cellH,
  };
}

/**
 * The bottom of the title screen: layered hills, a flag, a ball waiting on the
 * tee. Purely decorative, and drawn from the same palette the holes use so the
 * menu looks like it belongs to the game rather than in front of it.
 */
function drawScenery(ctx: CanvasRenderingContext2D, horizonY: number, time: number): void {
  const layers = [
    { fill: "#241f38", top: "#2f2848", base: horizonY + 6, amp: 9, freq: 0.021, phase: 0.6 },
    { fill: "#28503a", top: "#2f5f42", base: horizonY + 26, amp: 12, freq: 0.014, phase: 2.1 },
    { fill: "#3f7d46", top: "#63b061", base: horizonY + 52, amp: 8, freq: 0.026, phase: 4.3 },
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

/** Title screen: game name, progress, a play button, and a jump-to-any-hole grid. */
export function drawTitle(
  ctx: CanvasRenderingContext2D,
  opts: {
    holes: Hole[];
    bestStrokes: (number | null)[];
    furthestUnplayed: number;
    /** Seconds since load; drives the flag. Cosmetic — nothing here is simulated. */
    time?: number;
  },
): void {
  const L = titleLayout(opts.holes.length);

  // Sky: a shallow gradient rather than a flat fill, so the screen has a top
  // and a bottom instead of being one uniform slab.
  const sky = ctx.createLinearGradient(0, 0, 0, L.horizonY + 40);
  sky.addColorStop(0, "#1e1840");
  sky.addColorStop(1, "#171326");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  drawScenery(ctx, L.horizonY, opts.time ?? 0);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Wordmark, with a hard offset shadow for a little weight. The shadow is
  // near-black rather than a second hue: an offset pink copy reads as a
  // printing misregistration, not as depth.
  ctx.font = "24px monospace";
  ctx.fillStyle = "rgba(11, 9, 18, 0.55)";
  ctx.fillText("MEGA GOLF", VIEW.w / 2 + 2, L.titleY + 2);
  ctx.fillStyle = "#f2d24b";
  ctx.fillText("MEGA GOLF", VIEW.w / 2, L.titleY);
  ctx.font = "9px monospace";
  ctx.fillStyle = "#9d94b8";
  ctx.fillText(`${opts.holes.length - 1} holes, then the mega hole`, VIEW.w / 2, L.subY);

  // Progress: how much of the course you've actually put away. Label sits
  // above its own track — at 4 units tall the bar is a rule, and text sharing
  // that line just looks struck through.
  const done = opts.bestStrokes.reduce<number>((n, s) => n + (s !== null ? 1 : 0), 0);
  ctx.font = "7px monospace";
  ctx.fillStyle = "#5a5270";
  ctx.fillText(`${done} of ${opts.holes.length} holes bested`, VIEW.w / 2, L.barY);
  const trackY = L.barY + 10;
  ctx.fillStyle = "#241f38";
  ctx.fillRect(L.barX, trackY, L.barW, L.barH);
  if (done > 0) {
    ctx.fillStyle = "#63b061";
    ctx.fillRect(L.barX, trackY, (L.barW * done) / opts.holes.length, L.barH);
  }

  // Play button: a lighter top edge reads as a raised face, which is most of
  // what makes a flat rectangle look like something you press.
  ctx.fillStyle = "#3f7d46";
  ctx.fillRect(L.playX, L.playY, L.playW, L.playH);
  ctx.fillStyle = "#4c9455";
  ctx.fillRect(L.playX, L.playY, L.playW, 3);
  ctx.strokeStyle = "#63b061";
  ctx.lineWidth = 2;
  ctx.strokeRect(L.playX, L.playY, L.playW, L.playH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px monospace";
  ctx.fillText(opts.furthestUnplayed > 0 ? "CONTINUE ROUND" : "PLAY ROUND", VIEW.w / 2, L.playY + 7);

  ctx.font = "8px monospace";
  ctx.fillStyle = "#5a5270";
  ctx.fillText("— or pick a hole —", VIEW.w / 2, L.pickY + 4);

  opts.holes.forEach((hole, i) => {
    const { x, y, w, h } = titleCellRect(i, opts.holes.length);
    const isMega = i === opts.holes.length - 1;
    const best = opts.bestStrokes[i];
    const played = best !== null;

    ctx.fillStyle = isMega ? "#8d2f60" : played ? "#2b3a3c" : "#241f38";
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    // A played hole carries a green edge, so progress is legible as a shape
    // down the grid and not only as text you have to read cell by cell.
    ctx.fillStyle = isMega ? "#b8477f" : played ? "#63b061" : "#332c4d";
    ctx.fillRect(x + 2, y + 2, 2, h - 4);

    ctx.fillStyle = "#ffffff";
    ctx.font = "10px monospace";
    ctx.fillText(isMega ? "MEGA" : `${i + 1}`, x + w / 2, y + 5);
    ctx.font = "7px monospace";
    ctx.fillStyle = played ? "#7de08a" : "#7a719a";
    ctx.fillText(played ? `best ${best}` : `par ${hole.par}`, x + w / 2, y + 17);
  });

  ctx.textAlign = "left";
}

/** True if the point hits the in-game home button drawn by `drawHud`. */
export function homeButtonHitTest(x: number, y: number): boolean {
  const b = homeButton();
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** Hit-testing to match drawTitle's layout. Returns a hole index, or -1 for the play button, or null for no hit. */
export function titleHitTest(x: number, y: number, holeCount: number): number | null {
  const { playX, playY, playW, playH, cols, cellW, cellH, gridTop, gridLeft } = titleLayout(holeCount);
  if (x >= playX && x <= playX + playW && y >= playY && y <= playY + playH) return -1;

  if (y < gridTop) return null;
  const row = Math.floor((y - gridTop) / cellH);
  const col = Math.floor((x - gridLeft) / cellW);
  if (col < 0 || col >= cols) return null;
  const i = row * cols + col;
  if (i < 0 || i >= holeCount) return null;
  return i;
}

/** End-of-round scorecard: front nine / back nine + mega hole / total. */
export function drawScorecard(
  ctx: CanvasRenderingContext2D,
  opts: { holes: Hole[]; strokes: (number | null)[] },
): void {
  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f2d24b";
  ctx.font = "18px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("SCORECARD", VIEW.w / 2, 10);

  // Margins shrink with the viewport: the landscape-only 60px inset left a
  // portrait screen with barely room for "12 (par 30)" beside its label.
  const margin = Math.max(12, Math.round(VIEW.w * 0.125));

  const frontEnd = 9;
  const backEnd = opts.holes.length - 1;

  const section = (from: number, to: number) => {
    let par = 0;
    let strokes = 0;
    let played = 0;
    for (let i = from; i < to; i++) {
      par += opts.holes[i].par;
      if (opts.strokes[i] !== null) {
        strokes += opts.strokes[i]!;
        played++;
      }
    }
    return { par, strokes, played, of: to - from };
  };

  const front = section(0, frontEnd);
  const back = section(frontEnd, backEnd);
  const mega = section(backEnd, opts.holes.length);
  const total = section(0, opts.holes.length);

  ctx.font = "11px monospace";
  ctx.textAlign = "left";
  const rows: [string, ReturnType<typeof section>][] = [
    ["OUT (front 9)", front],
    ["IN (back 9)", back],
    ["MEGA HOLE", mega],
  ];
  let y = 40;
  for (const [label, s] of rows) {
    ctx.fillStyle = "#9d94b8";
    ctx.fillText(label, margin, y);
    ctx.fillStyle = s.played === s.of ? "#ffffff" : "#5a5270";
    const scoreText = s.played === s.of ? `${s.strokes} (par ${s.par})` : `${s.played}/${s.of} played`;
    ctx.textAlign = "right";
    ctx.fillText(scoreText, VIEW.w - margin, y);
    ctx.textAlign = "left";
    y += 18;
  }

  y += 10;
  ctx.strokeStyle = "#3a3252";
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(VIEW.w - margin, y);
  ctx.stroke();
  y += 12;

  ctx.font = "15px monospace";
  ctx.fillStyle = "#f2d24b";
  ctx.fillText("TOTAL", margin, y);
  ctx.textAlign = "right";
  if (total.played === total.of) {
    const diff = total.strokes - total.par;
    const diffText = diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
    ctx.fillText(`${total.strokes} (${diffText})`, VIEW.w - margin, y);
  } else {
    ctx.fillText(`${total.played}/${total.of} played`, VIEW.w - margin, y);
  }
  ctx.textAlign = "left";

  ctx.textAlign = "center";
  ctx.font = "9px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("tap for title", VIEW.w / 2, VIEW.h - 16);
  ctx.textAlign = "left";
}
