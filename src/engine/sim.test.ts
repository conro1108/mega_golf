import { describe, it, expect } from "vitest";
import { createSim, simulateShot, step, strike, DT, BALL_RADIUS } from "./sim";
import { buildEdges, type Hole } from "./world";
import { HOLES } from "../holes";

/**
 * A flat strip of the given material, surface at y=200. Deliberately absurdly
 * long: a low-friction material must be free to run out to its natural stop
 * without clipping the out-of-bounds check, or roll-distance comparisons
 * silently measure the world edge instead of the material.
 */
const STRIP_LEN = 100000;

function flatHole(material: Hole["terrain"][number]["material"], name = "flat"): Hole {
  return {
    name,
    idea: "test fixture",
    par: 2,
    width: STRIP_LEN,
    height: 270,
    start: [20, 200 - BALL_RADIUS],
    cup: [STRIP_LEN - 20, 200],
    terrain: [
      {
        material,
        points: [
          [0, 200],
          [STRIP_LEN, 200],
          [STRIP_LEN, 270],
          [0, 270],
        ],
      },
    ],
  };
}

function runToRest(hole: Hole, angle: number, power: number) {
  const sim = createSim(hole);
  return simulateShot(sim, { angle, power });
}

describe("determinism", () => {
  // This is the load-bearing test for the whole ghost-putt design. If it ever
  // fails, recorded shots stop replaying and the async layer is dead.
  it("replays a shot to a bit-identical resting position", () => {
    const shot = { angle: -0.6, power: 380 };
    const a = simulateShot(createSim(HOLES[0]), shot);
    const b = simulateShot(createSim(HOLES[0]), shot);
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);
    expect(b.steps).toBe(a.steps);
  });

  it("stays identical across every hole and a spread of shots", () => {
    for (const hole of HOLES) {
      for (let i = 0; i < 12; i++) {
        const shot = { angle: -1.4 + i * 0.1, power: 120 + i * 25 };
        const a = simulateShot(createSim(hole), shot);
        const b = simulateShot(createSim(hole), shot);
        expect([b.x, b.y, b.steps, b.state]).toEqual([a.x, a.y, a.steps, a.state]);
      }
    }
  });

  it("diverges for different inputs (the test above isn't vacuous)", () => {
    const a = simulateShot(createSim(HOLES[0]), { angle: -0.6, power: 380 });
    const b = simulateShot(createSim(HOLES[0]), { angle: -0.6, power: 381 });
    expect(b.x).not.toBe(a.x);
  });

  it("is independent of frame pacing", () => {
    // Stepping one-at-a-time vs. draining a backlog must agree, because the
    // sim only ever sees whole DT steps.
    const shot = { angle: -0.7, power: 400 };
    const oneAtATime = simulateShot(createSim(HOLES[1]), shot);

    const sim = createSim(HOLES[1]);
    strike(sim, shot);
    let acc = 0;
    while (sim.state === "moving") {
      acc += DT * 3.7; // ragged "frame" of 3.7 steps' worth of time
      while (acc >= DT && sim.state === "moving") {
        step(sim);
        acc -= DT;
      }
    }
    expect([sim.ball.x, sim.ball.y]).toEqual([oneAtATime.x, oneAtATime.y]);
  });
});

describe("resting", () => {
  it("settles rather than jittering forever on flat ground", () => {
    const r = runToRest(flatHole("green"), -0.9, 300);
    expect(r.state).toBe("resting");
    // Well short of the 45s bail-out cap.
    expect(r.steps).toBeLessThan(120 * 20);
  });

  it("comes to rest sitting on the surface, not sunk into it", () => {
    const sim = createSim(flatHole("green"));
    simulateShot(sim, { angle: -0.9, power: 300 });
    expect(sim.ball.y).toBeCloseTo(200 - BALL_RADIUS, 1);
  });

  it("does not move when struck while already moving", () => {
    const sim = createSim(HOLES[0]);
    strike(sim, { angle: -0.8, power: 300 });
    step(sim);
    const strokes = sim.strokes;
    strike(sim, { angle: 0, power: 400 });
    expect(sim.strokes).toBe(strokes);
  });
});

describe("materials", () => {
  const shot = { angle: -0.35, power: 400 };

  it("sand kills momentum faster than green", () => {
    const green = runToRest(flatHole("green"), shot.angle, shot.power);
    const sand = runToRest(flatHole("sand"), shot.angle, shot.power);
    expect(sand.x).toBeLessThan(green.x);
  });

  it("ice carries further than green", () => {
    const green = runToRest(flatHole("green"), shot.angle, shot.power);
    const ice = runToRest(flatHole("ice"), shot.angle, shot.power);
    expect(ice.x).toBeGreaterThan(green.x);
  });

  it("rubber bounces higher than green", () => {
    const peak = (material: Hole["terrain"][number]["material"]) => {
      const sim = createSim(flatHole(material));
      strike(sim, { angle: -0.2, power: 420 });
      let top = sim.ball.y;
      let bounced = false;
      while (sim.state === "moving") {
        step(sim);
        if (sim.contact) bounced = true;
        if (bounced) top = Math.min(top, sim.ball.y);
      }
      return top;
    };
    expect(peak("rubber")).toBeLessThan(peak("green"));
  });
});

describe("top-down", () => {
  const topDown = HOLES.find((h) => h.floor !== undefined)!;

  it("exists in the hole set", () => {
    expect(topDown).toBeDefined();
    expect(topDown.gravity).toEqual([0, 0]);
  });

  it("does not fall — a purely horizontal shot stays on its row", () => {
    const sim = createSim(topDown);
    const y0 = sim.ball.y;
    strike(sim, { angle: 0, power: 200 });
    for (let i = 0; i < 30; i++) step(sim);
    expect(sim.ball.y).toBe(y0);
  });

  it("comes to rest on floor friction alone, with no wall contact", () => {
    // Aimed up the open left channel so nothing is touched on the way.
    const sim = createSim(topDown);
    const r = simulateShot(sim, { angle: -Math.PI / 2, power: 150 });
    expect(r.state).toBe("resting");
    expect(r.steps).toBeLessThan(120 * 20);
    expect(sim.ball.y).toBeLessThan(topDown.start[1]);
  });

  it("still banks off walls", () => {
    const sim = createSim(topDown);
    simulateShot(sim, { angle: -0.2, power: 420 });
    // It cannot have passed through the right-hand wall.
    expect(sim.ball.x).toBeLessThan(472);
  });

  it("replays deterministically like every other hole", () => {
    const shot = { angle: -0.55, power: 380 };
    const a = simulateShot(createSim(topDown), shot);
    const b = simulateShot(createSim(topDown), shot);
    expect([b.x, b.y, b.steps]).toEqual([a.x, a.y, a.steps]);
  });
});

describe("scoring", () => {
  it("holes out and stops accepting strokes", () => {
    const hole = flatHole("green", "gimme");
    const sim = createSim({ ...hole, cup: [60, 200 - BALL_RADIUS] });
    // Nudge it gently down the strip into a near cup.
    for (let i = 0; i < 6 && sim.state !== "holed"; i++) {
      simulateShot(sim, { angle: -0.25, power: 120 });
    }
    expect(sim.state).toBe("holed");
    const strokes = sim.strokes;
    strike(sim, { angle: -0.5, power: 300 });
    expect(sim.strokes).toBe(strokes);
  });

  it("charges a penalty stroke and resets when the ball leaves the world", () => {
    const cliff: Hole = {
      name: "cliff",
      idea: "test fixture",
      par: 2,
      width: 400,
      height: 270,
      start: [20, 200 - BALL_RADIUS],
      cup: [380, 200],
      terrain: [{ material: "green", points: [[0, 200], [80, 200], [80, 270], [0, 270]] }],
    };
    const sim = createSim(cliff);
    const before = { x: sim.ball.x, y: sim.ball.y };
    simulateShot(sim, { angle: -0.4, power: 420 });
    expect(sim.strokes).toBe(2); // the shot, plus the penalty
    expect(sim.ball.x).toBeCloseTo(before.x, 5);
    expect(sim.state).toBe("resting");
  });
});

describe("world", () => {
  it("closes each terrain polygon into edges", () => {
    const edges = buildEdges(flatHole("green"));
    expect(edges).toHaveLength(4);
    // Last edge wraps back to the first point.
    expect([edges[3].x2, edges[3].y2]).toEqual([0, 200]);
  });

  it("gives every authored hole a stated idea and a sane par", () => {
    for (const h of HOLES) {
      expect(h.idea.length).toBeGreaterThan(0);
      expect(h.par).toBeGreaterThanOrEqual(2);
      expect(h.par).toBeLessThanOrEqual(5);
    }
  });
});
