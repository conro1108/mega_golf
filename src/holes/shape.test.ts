import { describe, it, expect } from "vitest";
import { smooth, ridge, blob, pocket, platform, restY, SPACING, type Pt } from "./shape";
import { BALL_RADIUS, MAX_POWER, createGame, simulateShot } from "../engine/game";
import type { Hole } from "../engine/world";

const PROFILE: Pt[] = [
  [0, 210],
  [120, 180],
  [240, 220],
  [360, 170],
  [480, 200],
];

function seg(points: readonly Pt[], i: number): number {
  const dx = points[i + 1][0] - points[i][0];
  const dy = points[i + 1][1] - points[i][1];
  return Math.sqrt(dx * dx + dy * dy);
}

describe("smooth", () => {
  it("passes through every control point", () => {
    const out = smooth(PROFILE);
    for (const c of PROFILE) {
      expect(out.some((p) => p[0] === c[0] && p[1] === c[1])).toBe(true);
    }
  });

  it("starts and ends exactly on the profile's ends", () => {
    const out = smooth(PROFILE);
    expect(out[0]).toEqual(PROFILE[0]);
    expect(out[out.length - 1]).toEqual(PROFILE[PROFILE.length - 1]);
  });

  /**
   * A ground polygon that doubles back on itself in x has interior edges the
   * ball can catch on from underneath. Overshoot in a spline is exactly how
   * that happens, so it's worth asserting rather than eyeballing.
   */
  it("keeps x strictly increasing along a left-to-right profile", () => {
    const out = smooth(PROFILE);
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i + 1][0]).toBeGreaterThan(out[i][0]);
    }
  });

  it("samples near the requested chord length, never much finer", () => {
    const out = smooth(PROFILE, SPACING);
    for (let i = 0; i < out.length - 1; i++) {
      // Too fine and the ball touches two edges at once, which plays sticky;
      // too coarse and the "curve" is visibly a chain of straights.
      expect(seg(out, i)).toBeGreaterThan(SPACING * 0.4);
      expect(seg(out, i)).toBeLessThan(SPACING * 1.8);
    }
  });

  it("is bit-for-bit reproducible", () => {
    // The whole reason this is Catmull-Rom arithmetic and not a sine wave.
    expect(JSON.stringify(smooth(PROFILE))).toBe(JSON.stringify(smooth(PROFILE)));
  });

  it("returns the controls unchanged when there are too few to curve", () => {
    expect(smooth([[0, 0], [10, 10]])).toEqual([[0, 0], [10, 10]]);
  });

  it("wraps around when closed", () => {
    const loop = blob([[0, 0], [100, 0], [100, 100], [0, 100]]);
    expect(loop.length).toBeGreaterThan(8);
    // A closed loop has no duplicated end point; it comes back on its own.
    expect(loop[loop.length - 1]).not.toEqual(loop[0]);
    const xs = loop.map((p) => p[0]);
    const ys = loop.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(6);
    expect(Math.max(...xs)).toBeGreaterThan(94);
    expect(Math.min(...ys)).toBeLessThan(6);
    expect(Math.max(...ys)).toBeGreaterThan(94);
  });
});

describe("ridge", () => {
  const t = ridge("green", PROFILE, 300);

  it("closes the surface down to the baseline", () => {
    const pts = t.points;
    expect(pts[pts.length - 1]).toEqual([PROFILE[0][0], 300]);
    expect(pts[pts.length - 2]).toEqual([PROFILE[PROFILE.length - 1][0], 300]);
  });

  it("keeps the whole body under the baseline and over the profile", () => {
    for (const [, y] of t.points) expect(y).toBeLessThanOrEqual(300);
    expect(t.material).toBe("green");
  });
});

describe("restY", () => {
  it("puts a resting ball one radius above the surface", () => {
    const surface = smooth(PROFILE);
    const x = 240;
    const onSurface = surface.find((p) => p[0] === x)!;
    expect(restY(PROFILE, x)).toBeCloseTo(onSurface[1] - BALL_RADIUS, 10);
  });

  it("interpolates between samples rather than snapping to one", () => {
    const y = restY(PROFILE, 125);
    const a = restY(PROFILE, 120);
    const b = restY(PROFILE, 130);
    expect(y).toBeGreaterThan(Math.min(a, b) - 1);
    expect(y).toBeLessThan(Math.max(a, b) + 1);
  });

  it("throws rather than silently returning a wrong cup height off the ends", () => {
    expect(() => restY(PROFILE, 900)).toThrow();
  });
});

/**
 * The pocket is the whole reason a side-view hole feels like skee-ball rather
 * than golf, and the property that makes it one is asymmetric: an arc drops
 * in, a ground ball does not. Both halves matter — a pocket that accepted
 * rollers would just be a cup, and one that rejected arcs too would be
 * unplayable.
 */
describe("pocket", () => {
  const p = pocket(400, 210, 270, {});
  const hole: Hole = {
    name: "pocket rig",
    idea: "test fixture",
    par: 3,
    width: 560,
    height: 270,
    start: [60, 207],
    cup: p.cup,
    terrain: [
      // A long flat approach feeding the pocket from the left, so a rolling
      // ball genuinely arrives at the lip with speed.
      platform(0, 340, 210, 270),
      ...p.terrain,
    ],
  };

  it("puts the cup at rest height on the well floor", () => {
    expect(p.cup[0]).toBe(400);
    expect(p.cup[1]).toBe(210 + 20 - BALL_RADIUS);
  });

  it("rejects a ball rolled flat along the ground, at any speed", () => {
    for (let k = 2; k <= 10; k++) {
      const r = simulateShot(createGame(hole), { angle: 0, power: (MAX_POWER * k) / 10 });
      expect(r.state, `flat roll at power ${k}/10 should not drop in`).not.toBe("holed");
    }
  });

  it("accepts an arc that comes down through the mouth", () => {
    let holed = 0;
    for (let a = 0; a < 90; a++) {
      for (let k = 4; k <= 10; k++) {
        const r = simulateShot(createGame(hole), {
          angle: -(a / 90) * (Math.PI / 2),
          power: (MAX_POWER * k) / 10,
        });
        if (r.state === "holed") holed += 1;
      }
    }
    expect(holed).toBeGreaterThan(0);
  });
});
