/**
 * Orchestration: canvas sizing, input, camera, game state, and the frame loop.
 *
 * The frame loop accumulates real time and drains it in whole DT steps — the
 * simulation never sees a variable delta, so what you watch on screen is the
 * same sequence a headless replay produces.
 */

import { createSim, strike, step, maxPowerForLie, DT, type Sim } from "./engine/sim";
import { isTopDown, type Hole, type Shot } from "./engine/world";
import {
  draw,
  drawAim,
  drawHud,
  drawTitle,
  drawScorecard,
  titleHitTest,
  homeButtonHitTest,
  SINK_FRAMES,
} from "./render/draw";
import { VIEW, computeViewSize, setViewSize, cameraAxis } from "./render/view";
import { drawMinimap, minimapHitTest, overviewZoom } from "./render/minimap";
import { COURSES, type Course } from "./holes";
import { loadBest, saveBestIfBetter, memoryStorage, type Storage } from "./persistence";

const MAX_DRAG = 70;
/** Minimum drag to register as a shot at all — small enough to allow a real gentle tap-in. */
const MIN_POWER = 6;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

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

/**
 * Which course you're in. Perspective belongs to the course, so this is also
 * "which of the two games am I playing" — picked on the title screen and
 * fixed for the whole round.
 */
let courseIndex = 0;
const course = (): Course => COURSES[courseIndex];
const holes = (): Hole[] => course().holes;

let scale = 1;
let holeIndex = 0;
let sim: Sim = createSim(holes()[holeIndex]);
let camX = 0;
let camY = 0;

/**
 * Overview: the whole hole zoomed to fit, so a first shot can be planned
 * against the actual layout instead of the one screen the ball starts on.
 * `zoom` eases toward the mode's target rather than cutting, because a hard
 * cut to a 3x-smaller world costs the player their bearings — which is the
 * one thing this feature exists to give them.
 */
let overview = false;
let zoom = 1;

/** Best run (if any) for the current hole, replayed as a translucent ghost. */
let ghost: { sim: Sim; shots: readonly Shot[]; nextIndex: number } | null = null;

/** Shots taken this attempt, recorded so a new best can be replayed later. */
let attemptShots: Shot[] = [];
/** Guards the holed-transition bookkeeping (scorecard + best run) to run once. */
let resultRecorded = false;
/** Frames since the ball was holed, driving the drop-into-the-cup animation. */
let holedFrames = 0;

/**
 * This session's official scorecard — first completion per hole, per
 * DESIGN.md — kept per course, so playing a few top-down holes doesn't
 * disturb a side-view round in progress.
 */
const roundStrokes: (number | null)[][] = COURSES.map((c) => c.holes.map(() => null));
let bestStrokesCache: (number | null)[] = [];

function refreshBests(): void {
  bestStrokesCache = holes().map((h) => loadBest(storage, h.name)?.strokes ?? null);
}
refreshBests();

let dragging = false;
let dragStart = { x: 0, y: 0 };
let aimAngle = 0;
let aimPower = 0;

function resize(): void {
  // Measure the padded content box, not the window: `body` is inset by the
  // safe-area env() values, so sizing from innerWidth/innerHeight overflows an
  // `overflow: hidden` body and clips the canvas at both ends. In landscape
  // there was vertical slack to absorb that; in portrait the buffer's aspect
  // nearly matches the screen, so the bottom-left MENU button would end up
  // under the home indicator.
  const style = getComputedStyle(document.body);
  const pad = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const availW = window.innerWidth - pad(style.paddingLeft) - pad(style.paddingRight);
  const availH = window.innerHeight - pad(style.paddingTop) - pad(style.paddingBottom);

  // The buffer takes the available box's shape, so a phone held portrait gets
  // a tall viewport instead of a letterboxed sliver of a landscape one.
  const prevW = VIEW.w;
  const prevH = VIEW.h;
  setViewSize(computeViewSize(availW, availH));

  // Fill the available space rather than snapping to whole-number scales:
  // on most phone viewports an integer-only scale leaves a third of the
  // screen as dead black bars ("mushed into the middle").
  scale = Math.min(availW / VIEW.w, availH / VIEW.h);

  // Draw at the display's real resolution. The renderer works in world units
  // (a ~480-wide coordinate space) and everything it draws is vector — fills,
  // arcs, text — so there is no reason to rasterise into a tiny buffer and
  // stretch it. Doing that was the blurriness: a 480-wide buffer blown up ~6x
  // on a 3x-DPR phone magnified every antialiased edge into a soft halo.
  // Backing store = CSS size x devicePixelRatio, with the world-to-device
  // scale baked into the context transform, so text and edges land on real
  // pixels and stay sharp.
  const dpr = window.devicePixelRatio || 1;
  const cssW = VIEW.w * scale;
  const cssH = VIEW.h * scale;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(canvas.width / VIEW.w, 0, 0, canvas.height / VIEW.h, 0, 0);
  ctx.imageSmoothingEnabled = true;

  // A different viewport means a different camera clamp, so re-anchor — but
  // only when it actually changed. Mobile browsers fire `resize` every time
  // the URL bar collapses, and snapping the camera mid-shot on each of those
  // would be a visible lurch.
  if (state === "playing" && (VIEW.w !== prevW || VIEW.h !== prevH)) updateCamera(true);
}

function firstUnplayedIndex(): number {
  const i = roundStrokes[courseIndex].findIndex((s) => s === null);
  return i === -1 ? 0 : i;
}

function loadHole(i: number): void {
  const n = holes().length;
  holeIndex = ((i % n) + n) % n;
  const hole = holes()[holeIndex];
  sim = createSim(hole);
  attemptShots = [];
  resultRecorded = false;
  holedFrames = 0;

  const best = loadBest(storage, hole.name);
  ghost = best ? { sim: createSim(hole), shots: best.shots, nextIndex: 0 } : null;

  // A hole opens on the ball, ready to hit. The overview is on request only —
  // the corner map carries the orientation, and forcing a peek every load
  // taxes the retries far more than it helps the first look.
  overview = false;
  zoom = 1;
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
  const scores = roundStrokes[courseIndex];
  for (let i = 0; i < holes().length; i++) {
    if (scores[i] === null) continue;
    strokes += scores[i]!;
    par += holes()[i].par;
    any = true;
  }
  return any ? strokes - par : null;
}

/** The zoom this mode wants; 1 unless the overview is open on an oversized hole. */
function targetZoom(): number {
  return overview ? overviewZoom(sim.hole) : 1;
}

function updateCamera(snap: boolean): void {
  // Zoomed out, one screen covers `VIEW.w / zoom` world units — the camera has
  // to clamp against that, or the overview pins itself to a corner.
  const targetX = cameraAxis(sim.ball.x, sim.hole.width, VIEW.w / zoom);
  const targetY = cameraAxis(sim.ball.y, sim.hole.height, VIEW.h / zoom);
  if (snap) {
    camX = targetX;
    camY = targetY;
  } else {
    camX += (targetX - camX) * 0.12;
    camY += (targetY - camY) * 0.12;
  }
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) / scale;
  const py = (e.clientY - rect.top) / scale;

  if (state === "title") {
    const hit = titleHitTest(px, py, holes().length);
    if (hit === null) return;
    if (hit.kind === "course") {
      // Switching course re-reads bests and re-anchors the grid; the round in
      // progress on the other course is kept, not cleared.
      courseIndex = hit.index;
      refreshBests();
      return;
    }
    loadHole(hit.kind === "play" ? firstUnplayedIndex() : hit.index);
    state = "playing";
    return;
  }

  if (state === "scorecard") {
    state = "title";
    refreshBests();
    return;
  }

  // state === "playing"
  // While the overview is open the whole screen is a "close" button — there's
  // nothing to aim at from out here, and hunting for a small target to get
  // back to the game would be worse than the problem it solves.
  if (overview) {
    overview = false;
    return;
  }
  if (minimapHitTest(sim.hole, px, py)) {
    overview = true;
    return;
  }
  if (homeButtonHitTest(px, py)) {
    state = "title";
    refreshBests();
    return;
  }
  if (sim.state === "holed") {
    if (holeIndex === holes().length - 1) {
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
  return maxPowerForLie(sim.groundMaterial);
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
  if (e.key === "o") overview = !overview;
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
    const tz = targetZoom();
    zoom += (tz - zoom) * 0.2;
    if (Math.abs(tz - zoom) < 0.002) zoom = tz;
    updateCamera(false);

    if (sim.state === "holed" && !resultRecorded) {
      resultRecorded = true;
      if (roundStrokes[courseIndex][holeIndex] === null) roundStrokes[courseIndex][holeIndex] = sim.strokes;
      lastIsNewBest = saveBestIfBetter(storage, sim.hole.name, { strokes: sim.strokes, shots: attemptShots });
      if (lastIsNewBest) bestStrokesCache[holeIndex] = sim.strokes;
    }

    if (sim.state === "holed" && holedFrames < SINK_FRAMES) holedFrames += 1;

    // The camera no longer snaps to whole world units: at device resolution one
    // world unit is several screen pixels, so rounding made a slow pan judder.
    draw(ctx, sim, camX, camY, ghost ? ghost.sim.ball : null, holedFrames / SINK_FRAMES, zoom);
    if (dragging && aimPower > 0) drawAim(ctx, sim, camX, camY, aimAngle, aimPower, currentMaxPower(), zoom);
    drawMinimap(ctx, sim, camX, camY, zoom, overview);
    drawHud(ctx, {
      name: sim.hole.name,
      par: sim.hole.par,
      strokes: sim.strokes,
      holed: sim.state === "holed",
      holeNumber: holeIndex + 1,
      holeCount: holes().length,
      roundToPar: roundToPar(),
      isNewBest: lastIsNewBest,
      topDown: isTopDown(sim.hole),
    });
  } else if (state === "title") {
    drawTitle(ctx, {
      courses: COURSES,
      courseIndex,
      holes: holes(),
      bestStrokes: bestStrokesCache,
      furthestUnplayed: firstUnplayedIndex(),
      time: now / 1000,
    });
  } else {
    drawScorecard(ctx, { course: course(), strokes: roundStrokes[courseIndex] });
  }

  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
