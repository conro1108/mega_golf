/**
 * Canvas pixel renderer. Fixed low-res buffer, integer-scaled by the caller —
 * everything here draws in world units at 1:1.
 */

import { BALL_RADIUS, CUP_RADIUS, type Sim } from "../engine/sim";
import { isTopDown, type Hole, type MaterialId } from "../engine/world";

export const VIEW_W = 480;
export const VIEW_H = 270;

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

export function draw(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  camX: number,
  camY: number,
  ghost?: { x: number; y: number } | null,
): void {
  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(-camX, -camY);

  for (const t of sim.hole.terrain) {
    tracePolygon(ctx, t.points);
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
      tracePolygon(ctx, h.points);
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

  ctx.textAlign = "right";
  ctx.fillStyle = "#9d94b8";
  ctx.font = "9px monospace";
  const roundLabel =
    opts.roundToPar === null ? "round: —" : `round: ${opts.roundToPar > 0 ? "+" : ""}${opts.roundToPar || "E"}`;
  ctx.fillText(roundLabel, VIEW_W - 6, 6);
  ctx.textAlign = "left";

  if (opts.holed) {
    const d = opts.strokes - opts.par;
    const label = d < -1 ? "EAGLE" : d === -1 ? "BIRDIE" : d === 0 ? "PAR" : d === 1 ? "BOGEY" : `+${d}`;
    ctx.fillStyle = "#f2d24b";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, VIEW_W / 2, VIEW_H / 2 - 20);
    ctx.font = "9px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("tap for next hole", VIEW_W / 2, VIEW_H / 2 + 2);
    if (opts.isNewBest) {
      ctx.fillStyle = "#7de08a";
      ctx.fillText("new best — ghost updated", VIEW_W / 2, VIEW_H / 2 + 14);
    }
    ctx.textAlign = "left";
  }
}

/** Title screen: game name, a play button, and a jump-to-any-hole grid. */
export function drawTitle(
  ctx: CanvasRenderingContext2D,
  opts: { holes: Hole[]; bestStrokes: (number | null)[]; furthestUnplayed: number },
): void {
  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f2d24b";
  ctx.font = "22px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("MEGA GOLF", VIEW_W / 2, 10);
  ctx.font = "9px monospace";
  ctx.fillStyle = "#9d94b8";
  ctx.fillText(`${opts.holes.length - 1} holes, then the mega hole`, VIEW_W / 2, 34);

  // Play button.
  const playY = 48;
  const playH = 26;
  ctx.fillStyle = "#3f7d46";
  ctx.fillRect(VIEW_W / 2 - 70, playY, 140, playH);
  ctx.strokeStyle = "#63b061";
  ctx.lineWidth = 2;
  ctx.strokeRect(VIEW_W / 2 - 70, playY, 140, playH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px monospace";
  ctx.fillText(opts.furthestUnplayed > 0 ? "CONTINUE ROUND" : "PLAY ROUND", VIEW_W / 2, playY + 6);

  // Hole-select grid.
  ctx.font = "8px monospace";
  ctx.fillStyle = "#9d94b8";
  ctx.fillText("or pick a hole", VIEW_W / 2, 84);

  const cols = 6;
  const cellW = 74;
  const cellH = 26;
  const gridTop = 96;
  const gridLeft = VIEW_W / 2 - (cols * cellW) / 2;
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

/** Hit-testing to match drawTitle's layout. Returns a hole index, or -1 for the play button, or null for no hit. */
export function titleHitTest(x: number, y: number, holeCount: number): number | null {
  const playY = 48;
  const playH = 26;
  if (x >= VIEW_W / 2 - 70 && x <= VIEW_W / 2 + 70 && y >= playY && y <= playY + playH) return -1;

  const cols = 6;
  const cellW = 74;
  const cellH = 26;
  const gridTop = 96;
  const gridLeft = VIEW_W / 2 - (cols * cellW) / 2;
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
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f2d24b";
  ctx.font = "18px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("SCORECARD", VIEW_W / 2, 10);

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
    ctx.fillText(label, 60, y);
    ctx.fillStyle = s.played === s.of ? "#ffffff" : "#5a5270";
    const scoreText = s.played === s.of ? `${s.strokes} (par ${s.par})` : `${s.played}/${s.of} played`;
    ctx.textAlign = "right";
    ctx.fillText(scoreText, VIEW_W - 60, y);
    ctx.textAlign = "left";
    y += 18;
  }

  y += 10;
  ctx.strokeStyle = "#3a3252";
  ctx.beginPath();
  ctx.moveTo(60, y);
  ctx.lineTo(VIEW_W - 60, y);
  ctx.stroke();
  y += 12;

  ctx.font = "15px monospace";
  ctx.fillStyle = "#f2d24b";
  ctx.fillText("TOTAL", 60, y);
  ctx.textAlign = "right";
  if (total.played === total.of) {
    const diff = total.strokes - total.par;
    const diffText = diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
    ctx.fillText(`${total.strokes} (${diffText})`, VIEW_W - 60, y);
  } else {
    ctx.fillText(`${total.played}/${total.of} played`, VIEW_W - 60, y);
  }
  ctx.textAlign = "left";

  ctx.textAlign = "center";
  ctx.font = "9px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("tap for title", VIEW_W / 2, VIEW_H - 16);
  ctx.textAlign = "left";
}
