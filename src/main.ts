/**
 * Orchestration: canvas sizing, input, camera, game state, and the frame loop.
 *
 * The frame loop accumulates real time and drains it in whole DT steps — the
 * simulation never sees a variable delta, so what you watch on screen is the
 * same sequence a headless replay produces.
 */

import { createSim, strike, step, DT, type Sim } from "./engine/sim";
import { isTopDown, type Shot } from "./engine/world";
import {
  draw,
  drawAim,
  drawHud,
  drawTitle,
  drawScorecard,
  titleHitTest,
  homeButtonHitTest,
  VIEW_W,
  VIEW_H,
} from "./render/draw";
import { HOLES } from "./holes";
import { loadBest, saveBestIfBetter, memoryStorage, type Storage } from "./persistence";

const MAX_POWER = 430;
const MAX_DRAG = 70;
/** Minimum drag to register as a shot at all — small enough to allow a real gentle tap-in. */
const MIN_POWER = 6;
/** A lie in sand saps a shot's reach, same as a real bunker lie. */
const SAND_POWER_SCALE = 0.55;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

function getStorage(): Storage {
  try {
    const probe = "megagolf:__probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private browsing / storage disabled: fall back so the game still runs.
    return memoryStorage();
  }
}
const storage = getStorage();

type GameState = "title" | "playing" | "scorecard";
let state: GameState = "title";

let scale = 1;
let holeIndex = 0;
let sim: Sim = createSim(HOLES[holeIndex]);
let camX = 0;
let camY = 0;

/** Best run (if any) for the current hole, replayed as a translucent ghost. */
let ghost: { sim: Sim; shots: readonly Shot[]; nextIndex: number } | null = null;

/** Shots taken this attempt, recorded so a new best can be replayed later. */
let attemptShots: Shot[] = [];
/** Guards the holed-transition bookkeeping (scorecard + best run) to run once. */
let resultRecorded = false;

/** This session's official scorecard — first completion per hole, per DESIGN.md. */
const roundStrokes: (number | null)[] = HOLES.map(() => null);
let bestStrokesCache: (number | null)[] = HOLES.map((h) => loadBest(storage, h.name)?.strokes ?? null);

let dragging = false;
let dragStart = { x: 0, y: 0 };
let aimAngle = 0;
let aimPower = 0;

function resize(): void {
  // Fill the available space rather than snapping to whole-number scales:
  // on most phone viewports an integer-only scale leaves a third of the
  // screen as dead black bars ("mushed into the middle"). imageSmoothingEnabled
  // stays off and the CSS uses `image-rendering: pixelated`, so a fractional
  // scale still reads as chunky pixel art, just not perfectly uniform pixels.
  scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  ctx.imageSmoothingEnabled = false;
}

function firstUnplayedIndex(): number {
  const i = roundStrokes.findIndex((s) => s === null);
  return i === -1 ? 0 : i;
}

function loadHole(i: number): void {
  holeIndex = ((i % HOLES.length) + HOLES.length) % HOLES.length;
  const hole = HOLES[holeIndex];
  sim = createSim(hole);
  attemptShots = [];
  resultRecorded = false;

  const best = loadBest(storage, hole.name);
  ghost = best ? { sim: createSim(hole), shots: best.shots, nextIndex: 0 } : null;

  updateCamera(true);
}

function advanceGhost(): void {
  if (!ghost) return;
  step(ghost.sim);
  if (ghost.sim.state === "resting" && ghost.nextIndex < ghost.shots.length) {
    strike(ghost.sim, ghost.shots[ghost.nextIndex]);
    ghost.nextIndex += 1;
  }
}

/** Strokes-to-par across holes completed so far this round, or null before the first. */
function roundToPar(): number | null {
  let strokes = 0;
  let par = 0;
  let any = false;
  for (let i = 0; i < HOLES.length; i++) {
    if (roundStrokes[i] === null) continue;
    strokes += roundStrokes[i]!;
    par += HOLES[i].par;
    any = true;
  }
  return any ? strokes - par : null;
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
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) / scale;
  const py = (e.clientY - rect.top) / scale;

  if (state === "title") {
    const hit = titleHitTest(px, py, HOLES.length);
    if (hit === -1) {
      loadHole(firstUnplayedIndex());
      state = "playing";
    } else if (hit !== null) {
      loadHole(hit);
      state = "playing";
    }
    return;
  }

  if (state === "scorecard") {
    state = "title";
    bestStrokesCache = HOLES.map((h) => loadBest(storage, h.name)?.strokes ?? null);
    return;
  }

  // state === "playing"
  if (homeButtonHitTest(px, py)) {
    state = "title";
    bestStrokesCache = HOLES.map((h) => loadBest(storage, h.name)?.strokes ?? null);
    return;
  }
  if (sim.state === "holed") {
    if (holeIndex === HOLES.length - 1) {
      state = "scorecard";
    } else {
      loadHole(holeIndex + 1);
    }
    return;
  }
  if (sim.state !== "resting") return;
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  aimPower = 0;
  canvas.setPointerCapture(e.pointerId);
});

/** The lie the ball is addressed from right now, for shot-scaling purposes. */
function currentMaxPower(): number {
  return sim.groundMaterial === "sand" ? MAX_POWER * SAND_POWER_SCALE : MAX_POWER;
}

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
  // A curved (not linear) mapping from drag length to power: it spreads more
  // of the drag's usable range across gentle, controlled putts — a linear
  // map compresses every short-game shot into the first few pixels of drag.
  const frac = Math.min(len, MAX_DRAG) / MAX_DRAG;
  aimPower = Math.pow(frac, 0.65) * currentMaxPower();
});

function release(): void {
  if (!dragging) return;
  dragging = false;
  if (aimPower < MIN_POWER) return;
  const shot: Shot = { angle: aimAngle, power: aimPower };
  attemptShots.push(shot);
  strike(sim, shot);
  aimPower = 0;
}

canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

window.addEventListener("keydown", (e) => {
  if (state !== "playing") return;
  if (e.key === "r") loadHole(holeIndex);
  if (e.key === "n") loadHole(holeIndex + 1);
  if (e.key === "p") loadHole(holeIndex - 1);
});

let acc = 0;
let last = performance.now();
let lastIsNewBest = false;

function frame(now: number): void {
  // Clamp so a backgrounded tab doesn't fast-forward the whole hole on return.
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;

  if (state === "playing") {
    while (acc >= DT) {
      step(sim);
      advanceGhost();
      acc -= DT;
    }
    updateCamera(false);

    if (sim.state === "holed" && !resultRecorded) {
      resultRecorded = true;
      if (roundStrokes[holeIndex] === null) roundStrokes[holeIndex] = sim.strokes;
      lastIsNewBest = saveBestIfBetter(storage, sim.hole.name, { strokes: sim.strokes, shots: attemptShots });
      if (lastIsNewBest) bestStrokesCache[holeIndex] = sim.strokes;
    }

    draw(ctx, sim, Math.round(camX), Math.round(camY), ghost ? ghost.sim.ball : null);
    if (dragging && aimPower > 0)
      drawAim(ctx, sim, Math.round(camX), Math.round(camY), aimAngle, aimPower, currentMaxPower());
    drawHud(ctx, {
      name: sim.hole.name,
      par: sim.hole.par,
      strokes: sim.strokes,
      holed: sim.state === "holed",
      holeNumber: holeIndex + 1,
      holeCount: HOLES.length,
      roundToPar: roundToPar(),
      isNewBest: lastIsNewBest,
      topDown: isTopDown(sim.hole),
    });
  } else if (state === "title") {
    drawTitle(ctx, { holes: HOLES, bestStrokes: bestStrokesCache, furthestUnplayed: firstUnplayedIndex() });
  } else {
    drawScorecard(ctx, { holes: HOLES, strokes: roundStrokes });
  }

  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
