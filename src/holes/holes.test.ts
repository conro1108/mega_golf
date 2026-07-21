/**
 * Content tests: properties every authored hole has to hold, as opposed to
 * properties of the simulation.
 */

import { describe, expect, it } from "vitest";
import { createSim, simulateShot, step, maxPowerForLie, BALL_RADIUS } from "../engine/sim";
import { pointInPolygon, type Hole } from "../engine/world";
import { HOLES } from "../holes";

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
  const sim = createSim(hole);
  sim.ball = { x, y: surfaceY - 60, vx: 0, vy: 0 };
  sim.safe = { x, y: surfaceY - 60 };
  sim.state = "moving";
  let guard = 0;
  while (sim.state === "moving" && guard++ < 5000) step(sim);
  return sim;
}

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
            const trial = createSim(bunker.hole);
            trial.ball = { ...settled.ball };
            trial.safe = { ...settled.safe };
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
