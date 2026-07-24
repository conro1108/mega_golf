/**
 * Content tests: properties every authored hole has to hold, as opposed to
 * properties of the simulation.
 */

import { describe, expect, it } from "vitest";
import {
  createGame,
  placeBall,
  simulateShot,
  stepGame,
  maxPowerForLie,
  BALL_RADIUS,
} from "../engine/game";
import { pointInPolygon, type Hole } from "../engine/world";
import { ALL_HOLES as HOLES } from "../holes";

/** Every side-view sand patch in the course, as (hole, polygon) pairs. */
function sideViewBunkers(): { hole: Hole; points: readonly (readonly [number, number])[] }[] {
  const out: { hole: Hole; points: readonly (readonly [number, number])[] }[] = [];
  for (const hole of HOLES) {
    // Top-down holes play sand as a floor, not as something you pitch into.
    if (hole.floor !== undefined) continue;
    for (const t of hole.terrain) {
      if (t.material === "sand") out.push({ hole, points: t.points });
    }
  }
  return out;
}

function bounds(points: readonly (readonly [number, number])[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
  }
  return { minX, maxX, minY };
}

/** Drop a ball onto the patch and let it settle: a realistic buried lie. */
function settleInto(hole: Hole, x: number, surfaceY: number) {
  const game = createGame(hole);
  placeBall(game, x, surfaceY - 60);
  let guard = 0;
  while (game.state === "moving" && guard++ < 5000) stepGame(game);
  return game;
}

/**
 * Curved ground is authored by control points, and the shape of a curve
 * decides where a ball ends up in a way a rectangle never did. These are the
 * two properties that broke while building the rolling holes: a cup left
 * floating above (or buried under) a surface whose height was guessed rather
 * than derived, and a hole where every landing spot sloped into the water.
 */
describe("every hole", () => {
  const cases = HOLES.map((h) => [h.name, h] as const);

  /** Put a ball somewhere and let physics finish with it. */
  function release(hole: Hole, x: number, y: number, steps = 6000) {
    const game = createGame(hole);
    placeBall(game, x, y);
    let guard = 0;
    while (game.state === "moving" && guard++ < steps) stepGame(game);
    return game;
  }

  it.each(cases)("%s: the cup sits at rest height on real ground", (_name, hole) => {
    // A ball placed exactly on the cup coordinate is a ball at rest in the
    // cup — that's what the coordinate means (see draw.ts `mouthY`).
    const game = release(hole, hole.cup[0], hole.cup[1], 600);
    expect(game.state).toBe("holed");
  });

  it.each(cases)("%s: the tee is a lie you can play from", (_name, hole) => {
    // No penalty before the player has even swung, it has to settle (a tee
    // that trickles forever is a hole you can never take a shot on), and it
    // must not simply fall in — High Dive's cup was briefly right below it.
    const game = release(hole, hole.start[0], hole.start[1]);
    expect(game.strokes).toBe(0);
    expect(game.state).toBe("resting");
  });

  it.each(cases.filter(([, h]) => h.floor === undefined))(
    "%s: has somewhere to actually land",
    (_name, hole) => {
      // Drop a ball down 24 columns of the hole. Most of a side-view hole is
      // deliberately open air now — that's the whole skee-ball premise — so
      // this is not asking for continuous ground. It's asking that landings
      // exist at all: the reshaped Water Hazard once had *zero* spots that
      // held a ball, every surface tipping into the pond, and it played as an
      // unwinnable hole rather than as a hard one.
      let held = 0;
      const columns = 24;
      for (let i = 0; i < columns; i++) {
        const game = release(hole, ((i + 0.5) * hole.width) / columns, 2);
        if (game.state === "resting" && game.strokes === 0) held += 1;
      }
      expect(held).toBeGreaterThanOrEqual(4);
    },
  );
});

/**
 * A hole that puts water either side of a landing is asking the player to hit
 * that landing. So the landing has to be able to *hold* a ball.
 *
 * It is not enough for ground to exist there. Both water holes were built with
 * domed islands, and a dome's only level spot is its peak — an unstable
 * equilibrium, so a ball that landed on one rolled off whichever side it
 * touched down on and every attempt ended wet. Water Hazard's island held a
 * ball at *zero* of its columns; the hole was unwinnable rather than hard.
 * Landings are dished plateaus now, and static friction (`grip`) lets ground
 * steeper than 2.5 degrees hold a ball at all.
 */
describe("islands between hazards", () => {
  /** The x-spans covered by a hole's hazards, merged and in order. */
  function hazardSpans(hole: Hole): { from: number; to: number }[] {
    const spans = (hole.hazards ?? []).map((h) => {
      let from = Infinity;
      let to = -Infinity;
      for (const [x] of h.points) {
        if (x < from) from = x;
        if (x > to) to = x;
      }
      return { from, to };
    });
    spans.sort((a, b) => a.from - b.from);
    const merged: { from: number; to: number }[] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
      else merged.push({ ...s });
    }
    return merged;
  }

  /**
   * Drop a ball straight down this column and run it to a stop. Returning the
   * game rather than a verdict keeps the caller's `state` comparison outside
   * the narrowing introduced by assigning `state` here.
   */
  function dropColumn(hole: Hole, x: number) {
    const game = createGame(hole);
    placeBall(game, x, 2);
    let guard = 0;
    while (game.state === "moving" && guard++ < 8000) stepGame(game);
    return game;
  }

  const islands: [string, Hole, number, number][] = [];
  for (const hole of HOLES) {
    if (hole.floor !== undefined) continue;
    const spans = hazardSpans(hole);
    for (let i = 0; i < spans.length - 1; i++) {
      islands.push([`${hole.name} island ${i + 1}`, hole, spans[i].to, spans[i + 1].from]);
    }
  }

  it("the course actually has islands between hazards to test", () => {
    expect(islands.length).toBeGreaterThan(0);
  });

  it.each(islands)("%s can hold a ball", (_label, hole, from, to) => {
    // Dropped from the top of the world: the harshest arrival there is, all
    // vertical speed and no forward travel. A real arc arrives kinder.
    let held = 0;
    for (let x = from + BALL_RADIUS; x <= to - BALL_RADIUS; x += 4) {
      const game = dropColumn(hole, x);
      if (game.state === "resting" && game.strokes === 0) held += 1;
    }
    expect(held, `nowhere between x=${from} and x=${to} holds a ball`).toBeGreaterThanOrEqual(3);
  });
});

describe("bunkers", () => {
  const bunkers = sideViewBunkers();

  it("the course actually has side-view bunkers to test", () => {
    expect(bunkers.length).toBeGreaterThan(0);
  });

  /**
   * The one property a bunker must have: it is a penalty, not a dead end.
   * Sand only began applying its own friction when contact material started
   * resolving by region, and that immediately turned The Beach's sheer-walled
   * pit into a ball you could never play out of — a fine grid of thousands of
   * legal shots from inside it escaped zero times. Ramped lips fixed it, and
   * this is what stops the next bunker regressing the same way.
   */
  it.each(bunkers.map((b, i) => [`${b.hole.name} #${i}`, b] as const))(
    "%s can be played out of, from anywhere in it",
    (_label, bunker) => {
      const { minX, maxX, minY } = bounds(bunker.points);
      // Sample across the patch, including hard against both lips.
      const spots = [minX + BALL_RADIUS + 1, (minX + maxX) / 2, maxX - BALL_RADIUS - 1];

      for (const x of spots) {
        const settled = settleInto(bunker.hole, x, minY);
        if (settled.groundMaterial !== "sand") continue; // never came to rest in the sand

        const power = maxPowerForLie("sand");
        let freed = false;
        for (let a = 0; a < 120 && !freed; a++) {
          for (let k = 1; k <= 8 && !freed; k++) {
            const trial = createGame(bunker.hole);
            placeBall(trial, settled.ball.position.x, settled.ball.position.y);
            trial.state = "resting";
            const r = simulateShot(trial, {
              angle: -Math.PI + (a / 120) * Math.PI * 2,
              power: (power * k) / 8,
            });
            // Out of the sand, or in the cup — either counts as playing on.
            if (r.state === "holed" || !pointInPolygon(r.x, r.y + BALL_RADIUS, bunker.points)) {
              freed = true;
            }
          }
        }
        expect(freed, `no legal shot escapes ${bunker.hole.name} at x=${x}`).toBe(true);
      }
    },
  );
});
