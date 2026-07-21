import { describe, it, expect } from "vitest";
import { createSim, simulateShot, step, strike, BALL_RADIUS } from "./sim";
import { isTopDown, pointInPolygon, type Hole } from "./world";

/**
 * A side-view hole that, halfway across, hands off into a top-down zone —
 * the mega hole's core trick at toy scale. Ball falls down a shaft, then a
 * zone starting at y >= 150 kills gravity and turns on floor friction.
 */
function handoffHole(): Hole {
  return {
    name: "handoff",
    idea: "test fixture",
    par: 4,
    width: 400,
    height: 300,
    start: [20, 20],
    cup: [380, 250],
    terrain: [
      // Side walls of the fall shaft, and a floor under the top-down zone so
      // the ball has something to land on.
      { material: "green", points: [[0, 280], [400, 280], [400, 300], [0, 300]] },
      { material: "rubber", points: [[0, 0], [4, 0], [4, 280], [0, 280]] },
      { material: "rubber", points: [[396, 0], [400, 0], [400, 280], [396, 280]] },
    ],
    zones: [{ points: [[0, 150], [400, 150], [400, 280], [0, 280]], gravity: [0, 0], floor: "green" }],
    checkpoints: [{ x: 200, y: 160, radius: 40 }],
  };
}

describe("zones", () => {
  it("falls under gravity above the zone", () => {
    const sim = createSim(handoffHole());
    strike(sim, { angle: Math.PI / 2, power: 1 }); // straight down, negligible launch speed
    const y0 = sim.ball.y;
    step(sim);
    expect(sim.ball.y).toBeGreaterThan(y0);
    expect(sim.ball.vy).toBeGreaterThan(0);
  });

  it("stops falling once inside a zero-gravity zone and decays via its floor", () => {
    const sim = createSim(handoffHole());
    sim.ball.y = 200; // already inside the zone
    strike(sim, { angle: 0, power: 200 });
    const before = sim.ball.vy;
    step(sim);
    // No gravity added inside the zone: vertical speed can only come from
    // floor friction pulling the (zero) vertical component further toward 0.
    expect(sim.ball.vy).toBeLessThanOrEqual(before);
    expect(Math.abs(sim.ball.vy)).toBeLessThan(1);
  });

  it("a shot struck above the zone eventually settles once it drops in and friction bites", () => {
    const sim = createSim(handoffHole());
    const r = simulateShot(sim, { angle: 0.05, power: 40 });
    expect(r.state).toBe("resting");
  });

  it("isTopDown reads true when the cup sits inside a floor zone", () => {
    expect(isTopDown(handoffHole())).toBe(true);
  });
});

describe("checkpoints", () => {
  it("banks the safe position once the ball enters the radius, without holing out", () => {
    const sim = createSim(handoffHole());
    sim.ball.x = 200;
    sim.ball.y = 165; // inside the checkpoint radius, well clear of the cup
    strike(sim, { angle: 0, power: 5 });
    step(sim);
    expect(sim.checkpointsHit[0]).toBe(true);
    expect(sim.safe.x).toBe(200);
    expect(sim.safe.y).toBe(160);
    expect(sim.state).not.toBe("holed");
  });

  it("does not re-trigger once already hit", () => {
    const sim = createSim(handoffHole());
    sim.checkpointsHit[0] = true;
    sim.safe.x = 1;
    sim.safe.y = 2;
    sim.ball.x = 200;
    sim.ball.y = 165;
    strike(sim, { angle: 0, power: 5 });
    step(sim);
    expect(sim.safe.x).toBe(1);
    expect(sim.safe.y).toBe(2);
  });
});

describe("hazards", () => {
  function hazardHole(): Hole {
    return {
      name: "hazard",
      idea: "test fixture",
      par: 3,
      width: 400,
      height: 270,
      start: [20, 200 - BALL_RADIUS],
      cup: [380, 200 - BALL_RADIUS],
      terrain: [{ material: "green", points: [[0, 200], [400, 200], [400, 270], [0, 270]] }],
      hazards: [{ points: [[150, 190], [250, 190], [250, 210], [150, 210]] }],
    };
  }

  it("charges a penalty and resets when the ball's centre enters the hazard", () => {
    const sim = createSim(hazardHole());
    const before = { x: sim.ball.x, y: sim.ball.y };
    const r = simulateShot(sim, { angle: -0.15, power: 260 });
    expect(r.strokes).toBe(2); // the shot, plus the hazard penalty
    expect(sim.ball.x).toBeCloseTo(before.x, 5);
    expect(sim.state).toBe("resting");
  });

  it("a shot that stops short of the hazard is unaffected", () => {
    const sim = createSim(hazardHole());
    const r = simulateShot(sim, { angle: -0.15, power: 40 });
    expect(r.strokes).toBe(1);
  });
});

describe("pointInPolygon", () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ] as const;

  it("is true for an interior point", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it("is false for an exterior point", () => {
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });
});
