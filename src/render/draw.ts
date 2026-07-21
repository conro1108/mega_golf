/**
 * Canvas pixel renderer. Fixed low-res buffer, integer-scaled by the caller —
 * everything here draws in world units at 1:1.
 */

import { BALL_RADIUS, CUP_RADIUS, type Sim } from "../engine/sim";
import type { MaterialId } from "../engine/world";

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

export function draw(ctx: CanvasRenderingContext2D, sim: Sim, camX: number, camY: number): void {
  ctx.fillStyle = "#171326";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(-camX, -camY);

  for (const t of sim.hole.terrain) {
    ctx.beginPath();
    ctx.moveTo(t.points[0][0], t.points[0][1]);
    for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i][0], t.points[i][1]);
    ctx.closePath();
    ctx.fillStyle = FILL[t.material];
    ctx.fill();
    ctx.strokeStyle = TOP[t.material];
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Cup.
  const [cx, cy] = sim.hole.cup;
  ctx.fillStyle = "#120f1c";
  ctx.beginPath();
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
  name: string,
  par: number,
  strokes: number,
  holed: boolean,
): void {
  ctx.fillStyle = "#ffffff";
  ctx.font = "10px monospace";
  ctx.textBaseline = "top";
  ctx.fillText(name, 6, 6);
  ctx.font = "16px monospace";
  ctx.fillText(`${strokes}`, 6, 18);
  ctx.font = "10px monospace";
  ctx.fillStyle = "#9d94b8";
  ctx.fillText(`par ${par}`, 22, 24);

  if (holed) {
    const d = strokes - par;
    const label = d < -1 ? "EAGLE" : d === -1 ? "BIRDIE" : d === 0 ? "PAR" : d === 1 ? "BOGEY" : `+${d}`;
    ctx.fillStyle = "#f2d24b";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, VIEW_W / 2, VIEW_H / 2 - 20);
    ctx.font = "9px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("tap for next hole", VIEW_W / 2, VIEW_H / 2 + 2);
    ctx.textAlign = "left";
  }
}
