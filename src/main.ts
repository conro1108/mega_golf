/**
 * Orchestration: canvas sizing, input, camera, and the frame loop.
 *
 * The frame loop accumulates real time and drains it in whole DT steps — the
 * simulation never sees a variable delta, so what you watch on screen is the
 * same sequence a headless replay produces.
 */

import { createSim, strike, step, DT, type Sim } from "./engine/sim";
import type { Shot } from "./engine/world";
import { draw, drawAim, drawHud, VIEW_W, VIEW_H } from "./render/draw";
import { HOLES } from "./holes";

const MAX_POWER = 430;
const MAX_DRAG = 70;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

let scale = 1;
let holeIndex = 0;
let sim: Sim = createSim(HOLES[holeIndex]);
let camX = 0;
let camY = 0;

/** Recorded shots, per the design notes: capture inputs from day one so the
 *  ghost-putt layer has data the moment it exists. */
const recorded: { hole: string; shot: Shot }[] = [];

let dragging = false;
let dragStart = { x: 0, y: 0 };
let aimAngle = 0;
let aimPower = 0;

function resize(): void {
  const raw = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  scale = raw >= 1 ? Math.floor(raw) : raw;
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  ctx.imageSmoothingEnabled = false;
}

function loadHole(i: number): void {
  holeIndex = ((i % HOLES.length) + HOLES.length) % HOLES.length;
  sim = createSim(HOLES[holeIndex]);
  updateCamera(true);
}

function updateCamera(snap: boolean): void {
  const targetX = clamp(sim.ball.x - VIEW_W / 2, 0, Math.max(0, sim.hole.width - VIEW_W));
  const targetY = clamp(sim.ball.y - VIEW_H / 2, 0, Math.max(0, sim.hole.height - VIEW_H));
  if (snap) {
    camX = targetX;
    camY = targetY;
  } else {
    camX += (targetX - camX) * 0.12;
    camY += (targetY - camY) * 0.12;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (sim.state === "holed") {
    loadHole(holeIndex + 1);
    return;
  }
  if (sim.state !== "resting") return;
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  aimPower = 0;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  // Pull back away from the intended direction, slingshot style.
  const dx = (dragStart.x - e.clientX) / scale;
  const dy = (dragStart.y - e.clientY) / scale;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) {
    aimPower = 0;
    return;
  }
  aimAngle = Math.atan2(dy, dx);
  aimPower = (Math.min(len, MAX_DRAG) / MAX_DRAG) * MAX_POWER;
});

function release(): void {
  if (!dragging) return;
  dragging = false;
  if (aimPower < 12) return;
  const shot: Shot = { angle: aimAngle, power: aimPower };
  recorded.push({ hole: sim.hole.name, shot });
  strike(sim, shot);
  aimPower = 0;
}

canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

window.addEventListener("keydown", (e) => {
  if (e.key === "r") loadHole(holeIndex);
  if (e.key === "n") loadHole(holeIndex + 1);
  if (e.key === "p") loadHole(holeIndex - 1);
});

let acc = 0;
let last = performance.now();

function frame(now: number): void {
  // Clamp so a backgrounded tab doesn't fast-forward the whole hole on return.
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= DT) {
    step(sim);
    acc -= DT;
  }
  updateCamera(false);

  draw(ctx, sim, Math.round(camX), Math.round(camY));
  if (dragging && aimPower > 0) drawAim(ctx, sim, Math.round(camX), Math.round(camY), aimAngle, aimPower, MAX_POWER);
  drawHud(ctx, sim.hole.name, sim.hole.par, sim.strokes, sim.state === "holed");

  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
loadHole(0);
requestAnimationFrame(frame);
