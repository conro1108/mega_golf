/**
 * Canvas pixel renderer. Low-res buffer scaled up by the caller — everything
 * here draws in world units at 1:1. The buffer's size is not fixed: it takes
 * the window's aspect ratio (see `view.ts`), so screen-anchored UI reads
 * `VIEW` rather than hard-coding 480x270.
 */

import { BALL_RADIUS, CUP_RADIUS, type Sim } from "../engine/sim";
import { isTopDown, type Hole, type MaterialId } from "../engine/world";
import { VIEW } from "./view";

const FILL: Record<MaterialId, string> = {
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

export function draw(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  camX: number,
  camY: number,
  ghost?: { x: number; y: number } | null,
): void {
  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  ctx.save();
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

  // Cup. Looking down the hole from above, it reads as a plain circle; from
  // the side it wants the flag.
  const [cx, cy] = sim.hole.cup;
  ctx.fillStyle = "#120f1c";
  ctx.beginPath();
  if (isTopDown(sim.hole)) {
    ctx.arc(cx, cy, CUP_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2d24b";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.ellipse(cx, cy + 1, CUP_RADIUS, CUP_RADIUS * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2d24b";
    ctx.fillRect(cx - 1, cy - 22, 2, 22);
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy - 22);
    ctx.lineTo(cx + 14, cy - 17);
    ctx.lineTo(cx + 1, cy - 12);
    ctx.closePath();
    ctx.fill();
  }

  // Ghost: a past best run, replaying underneath the live ball.
  if (ghost) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ball.
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(sim.ball.x, sim.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

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
): void {
  ctx.save();
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
 */
function titleLayout(): {
  playX: number;
  playY: number;
  playW: number;
  playH: number;
  cols: number;
  cellW: number;
  cellH: number;
  gridTop: number;
  gridLeft: number;
} {
  const playW = Math.min(140, VIEW.w - 40);
  const playH = 26;
  // Fewer, narrower columns as the screen narrows; a 6-wide grid needs ~440px.
  const cols = VIEW.w >= 420 ? 6 : VIEW.w >= 300 ? 4 : 3;
  const cellW = Math.min(74, Math.floor((VIEW.w - 12) / cols));
  return {
    playX: Math.round(VIEW.w / 2 - playW / 2),
    playY: 48,
    playW,
    playH,
    cols,
    cellW,
    cellH: 26,
    gridTop: 96,
    gridLeft: Math.round(VIEW.w / 2 - (cols * cellW) / 2),
  };
}

/** Title screen: game name, a play button, and a jump-to-any-hole grid. */
export function drawTitle(
  ctx: CanvasRenderingContext2D,
  opts: { holes: Hole[]; bestStrokes: (number | null)[]; furthestUnplayed: number },
): void {
  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f2d24b";
  ctx.font = "22px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("MEGA GOLF", VIEW.w / 2, 10);
  ctx.font = "9px monospace";
  ctx.fillStyle = "#9d94b8";
  ctx.fillText(`${opts.holes.length - 1} holes, then the mega hole`, VIEW.w / 2, 34);

  // Play button.
  const { playX, playY, playW, playH, cols, cellW, cellH, gridTop, gridLeft } = titleLayout();
  ctx.fillStyle = "#3f7d46";
  ctx.fillRect(playX, playY, playW, playH);
  ctx.strokeStyle = "#63b061";
  ctx.lineWidth = 2;
  ctx.strokeRect(playX, playY, playW, playH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px monospace";
  ctx.fillText(opts.furthestUnplayed > 0 ? "CONTINUE ROUND" : "PLAY ROUND", VIEW.w / 2, playY + 6);

  // Hole-select grid.
  ctx.font = "8px monospace";
  ctx.fillStyle = "#9d94b8";
  ctx.fillText("or pick a hole", VIEW.w / 2, 84);

  opts.holes.forEach((hole, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridLeft + col * cellW;
    const y = gridTop + row * cellH;
    const isMega = i === opts.holes.length - 1;
    ctx.fillStyle = isMega ? "#b8477f" : "#241f38";
    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
    ctx.fillStyle = "#ffffff";
    ctx.font = "9px monospace";
    ctx.fillText(isMega ? "MEGA" : `${i + 1}`, x + cellW / 2, y + 5);
    ctx.font = "7px monospace";
    ctx.fillStyle = opts.bestStrokes[i] !== null ? "#7de08a" : "#9d94b8";
    ctx.fillText(opts.bestStrokes[i] !== null ? `best ${opts.bestStrokes[i]}` : `par ${hole.par}`, x + cellW / 2, y + 16);
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
  const { playX, playY, playW, playH, cols, cellW, cellH, gridTop, gridLeft } = titleLayout();
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
