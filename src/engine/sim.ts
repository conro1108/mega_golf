/**
 * Deterministic fixed-timestep simulation.
 *
 * Determinism is a hard requirement, not a nice-to-have: ghost putts replay a
 * recorded (angle, power) and must land on the same pixel on every machine.
 * That constrains the math here to IEEE-754-exact operations — +, -, *, / and
 * sqrt. No Math.exp/pow/hypot/random, no wall-clock time, no iteration over
 * unordered collections. Friction uses a linear decay rather than the more
 * natural exponential for exactly this reason.
 */

import { buildEdges, DEFAULT_GRAVITY, MATERIALS, type Edge, type Hole, type Shot } from "./world";

export const DT = 1 / 120;
/** Side-view default. Per-hole gravity overrides this; top-down uses (0, 0). */
export const GRAVITY = 620;
export const BALL_RADIUS = 3;
export const CUP_RADIUS = 5;

/** Below this speed, and in contact, the ball is a candidate for sleeping. */
const REST_SPEED = 7;
/** Consecutive resting steps required before the ball is declared settled. */
const REST_STEPS = 14;
/** Hard cap so a pathological shot can't spin forever in a test. */
const MAX_STEPS = 120 * 45;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type BallState = "moving" | "resting" | "holed";

export interface Sim {
  hole: Hole;
  edges: Edge[];
  ball: Ball;
  state: BallState;
  /** Steps elapsed since the shot was struck; drives f(hole_time) elements. */
  steps: number;
  strokes: number;
  /** Where the ball last came to rest — the reset point after going out. */
  safe: { x: number; y: number };
  restCounter: number;
  contact: boolean;
}

export function createSim(hole: Hole): Sim {
  return {
    hole,
    edges: buildEdges(hole),
    ball: { x: hole.start[0], y: hole.start[1], vx: 0, vy: 0 },
    state: "resting",
    steps: 0,
    strokes: 0,
    safe: { x: hole.start[0], y: hole.start[1] },
    restCounter: 0,
    contact: false,
  };
}

/** Strike the ball. No-op unless it is at rest. */
export function strike(sim: Sim, shot: Shot): void {
  if (sim.state !== "resting") return;
  sim.ball.vx = Math.cos(shot.angle) * shot.power;
  sim.ball.vy = Math.sin(shot.angle) * shot.power;
  sim.state = "moving";
  sim.steps = 0;
  sim.strokes += 1;
  sim.restCounter = 0;
}

/** Advance exactly one fixed step. The only place time moves. */
export function step(sim: Sim): void {
  if (sim.state !== "moving") return;

  const b = sim.ball;
  const g = sim.hole.gravity ?? DEFAULT_GRAVITY;
  // Guarded so a zero-gravity hole performs no float op at all here, keeping
  // top-down bit-identical to a hand-written gravity-free integrator.
  if (g[0] !== 0) b.vx += g[0] * DT;
  if (g[1] !== 0) b.vy += g[1] * DT;

  // Substep so a fast ball can't tunnel through thin terrain. The count is
  // derived from speed, so it is identical on every replay.
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  let subs = Math.ceil((speed * DT) / (BALL_RADIUS * 0.5));
  if (subs < 1) subs = 1;
  if (subs > 8) subs = 8;
  const sdt = DT / subs;

  sim.contact = false;
  for (let s = 0; s < subs; s++) {
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;
    resolveContacts(sim, sdt);
  }

  // Top-down: the floor is everywhere, so its friction applies every step and
  // the ball is permanently in contact (which is what lets it come to rest).
  if (sim.hole.floor !== undefined) {
    let decay = 1 - MATERIALS[sim.hole.floor].friction * DT;
    if (decay < 0) decay = 0;
    b.vx = b.vx * decay;
    b.vy = b.vy * decay;
    sim.contact = true;
  }

  sim.steps += 1;

  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (sim.contact && sp < REST_SPEED) {
    sim.restCounter += 1;
    if (sim.restCounter >= REST_STEPS) settle(sim);
  } else {
    sim.restCounter = 0;
  }

  if (isInCup(sim)) {
    sim.state = "holed";
    return;
  }

  if (outOfBounds(sim)) {
    // Water / void: stroke penalty, back to the last rest position.
    sim.strokes += 1;
    b.x = sim.safe.x;
    b.y = sim.safe.y;
    b.vx = 0;
    b.vy = 0;
    settle(sim);
    return;
  }

  if (sim.steps >= MAX_STEPS) settle(sim);
}

function settle(sim: Sim): void {
  sim.ball.vx = 0;
  sim.ball.vy = 0;
  sim.state = "resting";
  sim.restCounter = 0;
  sim.safe.x = sim.ball.x;
  sim.safe.y = sim.ball.y;
}

function isInCup(sim: Sim): boolean {
  const dx = sim.ball.x - sim.hole.cup[0];
  const dy = sim.ball.y - sim.hole.cup[1];
  const d = Math.sqrt(dx * dx + dy * dy);
  const sp = Math.sqrt(sim.ball.vx * sim.ball.vx + sim.ball.vy * sim.ball.vy);
  return d < CUP_RADIUS && sp < 150;
}

function outOfBounds(sim: Sim): boolean {
  const b = sim.ball;
  return (
    b.y > sim.hole.height + 40 ||
    b.x < -40 ||
    b.x > sim.hole.width + 40
  );
}

function resolveContacts(sim: Sim, sdt: number): void {
  const b = sim.ball;
  // Fixed iteration order over a fixed array: same contacts, same sequence,
  // every run.
  for (let i = 0; i < sim.edges.length; i++) {
    const e = sim.edges[i];
    const ex = e.x2 - e.x1;
    const ey = e.y2 - e.y1;
    const len2 = ex * ex + ey * ey;
    if (len2 === 0) continue;

    let t = ((b.x - e.x1) * ex + (b.y - e.y1) * ey) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const cx = e.x1 + ex * t;
    const cy = e.y1 + ey * t;
    let nx = b.x - cx;
    let ny = b.y - cy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= BALL_RADIUS * BALL_RADIUS) continue;

    const d = Math.sqrt(d2);
    if (d === 0) {
      // Dead centre on the edge: push along the edge normal instead.
      const il = 1 / Math.sqrt(len2);
      nx = -ey * il;
      ny = ex * il;
    } else {
      nx = nx / d;
      ny = ny / d;
    }

    // Depenetrate.
    const pen = BALL_RADIUS - d;
    b.x += nx * pen;
    b.y += ny * pen;

    const m = MATERIALS[e.material];
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      // Reflect the normal component, scaled by restitution.
      const j = -(1 + m.restitution) * vn;
      b.vx += nx * j;
      b.vy += ny * j;
    }

    // Tangential friction. Linear decay keeps the math IEEE-exact.
    let decay = 1 - m.friction * sdt;
    if (decay < 0) decay = 0;
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    const dv = vt * decay - vt;
    b.vx += tx * dv;
    b.vy += ty * dv;

    sim.contact = true;
  }
}

export interface ShotResult {
  x: number;
  y: number;
  steps: number;
  state: BallState;
  strokes: number;
}

/**
 * Run a shot to completion. This is the ghost-putt primitive: given a hole and
 * a recorded shot, it reproduces the exact outcome without a renderer.
 */
export function simulateShot(sim: Sim, shot: Shot): ShotResult {
  strike(sim, shot);
  while (sim.state === "moving") step(sim);
  return {
    x: sim.ball.x,
    y: sim.ball.y,
    steps: sim.steps,
    state: sim.state,
    strokes: sim.strokes,
  };
}
