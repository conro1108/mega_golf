/**
 * The whole-hole overlay: a small map in the top-right corner, plus the
 * geometry for the zoomed-out "overview" it opens.
 *
 * A hole is routinely several screens wide (the mega hole is ~1400x760 against
 * a ~480-wide viewport), so the first shot was being played blind — you can't
 * choose between the safe route and the greedy one when you can't see either.
 * The minimap gives constant orientation; tapping it fits the entire hole on
 * screen for a proper read.
 *
 * Pure layout maths, in world units like the rest of the renderer.
 */

import { VIEW } from "./view";
import { FILL } from "./draw";
import type { Hole } from "../engine/world";
import type { Sim } from "../engine/sim";

export interface MinimapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** World units -> minimap units. */
  scale: number;
}

/** Extra tap slop around the minimap: it's small, and thumbs are not. */
const TAP_PAD = 8;

/**
 * How much bigger than the viewport a hole must be to be worth a map. A bare
 * `> VIEW` test meant a hole a handful of units too wide for the current
 * window — which any 480x270 hole is on a slightly-wide screen, since the
 * viewport is derived from the window's aspect — got a full corner map
 * covering a chunk of a hole you could already see all of.
 */
const OVERFLOW = 1.12;

/** True when a meaningful part of the hole is off screen — the case worth a map. */
export function needsOverview(hole: Hole): boolean {
  return hole.width > VIEW.w * OVERFLOW || hole.height > VIEW.h * OVERFLOW;
}

/** Opacity the map drops to while it would otherwise hide the ball or the cup. */
const DIMMED = 0.2;

/**
 * True when the ball or the cup is on screen *behind* the map.
 *
 * The map lives in the corner the camera pushes play into whenever the ball
 * is high and right — which on a top-down hole is exactly where the cup tends
 * to sit. Rather than adding a gesture to move it, the map notices it is in
 * the way and fades until it isn't; it stays tappable throughout.
 */
export function minimapOccluded(sim: Sim, camX: number, camY: number, zoom: number): boolean {
  const r = minimapRect(sim.hole);
  const pad = 6;
  const points: [number, number][] = [
    [sim.ball.x, sim.ball.y],
    [sim.hole.cup[0], sim.hole.cup[1]],
  ];
  for (const [wx, wy] of points) {
    const sx = (wx - camX) * zoom;
    const sy = (wy - camY) * zoom;
    if (sx >= r.x - pad && sx <= r.x + r.w + pad && sy >= r.y - pad && sy <= r.y + r.h + pad) {
      return true;
    }
  }
  return false;
}

/** Where the minimap sits, sized to fit the hole's aspect into a corner box. */
export function minimapRect(hole: Hole): MinimapRect {
  const boxW = Math.min(112, VIEW.w * 0.32);
  const boxH = Math.min(76, VIEW.h * 0.26);
  const scale = Math.min(boxW / hole.width, boxH / hole.height);
  const w = hole.width * scale;
  const h = hole.height * scale;
  return { x: VIEW.w - w - 6, y: 18, w, h, scale };
}

/** True if the point hits the minimap (with tap slop). */
export function minimapHitTest(hole: Hole, x: number, y: number): boolean {
  if (!needsOverview(hole)) return false;
  const r = minimapRect(hole);
  return (
    x >= r.x - TAP_PAD && x <= r.x + r.w + TAP_PAD && y >= r.y - TAP_PAD && y <= r.y + r.h + TAP_PAD
  );
}

/**
 * The corner map: the hole's silhouette, the cup, the ball, and a box showing
 * which slice of it you're currently looking at. Skipped entirely when the
 * whole hole already fits on screen.
 *
 * `camX`/`camY`/`zoom` describe the live camera, so the viewport box is right
 * mid-pan and mid-zoom rather than only when the camera is settled.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  camX: number,
  camY: number,
  zoom: number,
  open: boolean,
): void {
  const hole = sim.hole;
  if (!needsOverview(hole)) return;
  const r = minimapRect(hole);

  ctx.save();
  if (minimapOccluded(sim, camX, camY, zoom)) ctx.globalAlpha = DIMMED;
  ctx.fillStyle = "rgba(23, 19, 38, 0.82)";
  ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  ctx.strokeStyle = open ? "#f2d24b" : "#5a5270";
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);

  // Inner save: the world-scaled pass only. The outer save has to survive it,
  // or the dimming above would be dropped before the markers below draw.
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(r.scale, r.scale);

  // A top-down hole is floor-first: without this the map was a black box with
  // walls floating in it.
  if (hole.floor !== undefined) {
    ctx.fillStyle = FILL[hole.floor];
    ctx.fillRect(0, 0, hole.width, hole.height);
  }
  if (hole.zones) {
    for (const z of hole.zones) {
      if (z.floor === undefined) continue;
      ctx.fillStyle = FILL[z.floor];
      trace(ctx, z.points);
      ctx.fill();
    }
  }

  // Terrain silhouette — at this size hazards would just be noise, but the
  // silhouette is exactly what a player is trying to read.
  for (const t of hole.terrain) {
    ctx.fillStyle = FILL[t.material];
    trace(ctx, t.points);
    ctx.fill();
  }
  if (hole.hazards) {
    ctx.fillStyle = "rgba(43, 92, 168, 0.85)";
    for (const h of hole.hazards) {
      trace(ctx, h.points);
      ctx.fill();
    }
  }
  ctx.restore();

  // Markers and the viewport box are drawn unscaled: a dot has to stay a dot.
  const mx = (wx: number): number => r.x + wx * r.scale;
  const my = (wy: number): number => r.y + wy * r.scale;

  ctx.fillStyle = "#f2d24b";
  ctx.beginPath();
  ctx.arc(mx(hole.cup[0]), my(hole.cup[1]), 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(mx(sim.ball.x), my(sim.ball.y), 1.6, 0, Math.PI * 2);
  ctx.fill();

  // The "you are here" box, clipped to the map: on an axis where the camera
  // already shows more than the hole has (any portrait screen, and everything
  // in overview) the raw rectangle spills across the HUD.
  const bx0 = clamp(mx(camX), r.x, r.x + r.w);
  const by0 = clamp(my(camY), r.y, r.y + r.h);
  const bx1 = clamp(mx(camX + VIEW.w / zoom), r.x, r.x + r.w);
  const by1 = clamp(my(camY + VIEW.h / zoom), r.y, r.y + r.h);
  // Nothing to point at when the box is the whole map.
  if (bx1 - bx0 < r.w - 0.5 || by1 - by0 < r.h - 0.5) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  }

  ctx.fillStyle = "#9d94b8";
  ctx.font = "7px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(open ? "tap to close" : "tap for full hole", r.x + r.w, r.y + r.h + 3);
  ctx.textAlign = "left";
  ctx.restore();
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function trace(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

/**
 * World-to-screen scale that fits the entire hole on screen, with a little
 * margin so the outermost terrain isn't flush against the bezel. Never zooms
 * *in* past 1: a hole smaller than the viewport is already fully visible.
 */
export function overviewZoom(hole: Hole): number {
  const fit = Math.min(VIEW.w / hole.width, VIEW.h / hole.height) * 0.94;
  return fit < 1 ? fit : 1;
}
