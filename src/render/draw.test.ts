import { describe, it, expect } from "vitest";
import { holedBallSprite } from "./draw";
import { createSim, BALL_RADIUS } from "../engine/sim";
import { HOLES } from "../holes";

/**
 * The drop-in is render-only, but it's the bit of the cup a player actually
 * watches: a ball that stops beside the hole is the exact complaint this
 * replaced. These pin the endpoints of that motion.
 */
describe("holedBallSprite", () => {
  const hole = HOLES[0];
  const [cx, cy] = hole.cup;

  function heldOnRim() {
    const sim = createSim(hole);
    // Caught on the rim, off-centre and above the surface, as capture leaves it.
    sim.ball.x = cx - 6;
    sim.ball.y = cy;
    sim.state = "holed";
    return sim;
  }

  it("leaves a ball that is not holed exactly where the sim put it", () => {
    const sim = heldOnRim();
    const s = holedBallSprite(sim, cx, cy, false, 0);
    expect(s).toEqual({ x: sim.ball.x, y: sim.ball.y, r: BALL_RADIUS });
  });

  it("ends centred on the cup and below the lip", () => {
    const s = holedBallSprite(heldOnRim(), cx, cy, false, 1);
    expect(s.x).toBeCloseTo(cx, 6);
    // The mouth sits a ball-radius below the cup coordinate; the ball has to
    // finish under it, or it reads as resting on the green again.
    expect(s.y).toBeGreaterThan(cy + BALL_RADIUS + BALL_RADIUS);
    expect(s.r).toBe(BALL_RADIUS);
  });

  it("centres faster than it falls", () => {
    const sim = heldOnRim();
    const mid = holedBallSprite(sim, cx, cy, false, 0.4);
    const end = holedBallSprite(sim, cx, cy, false, 1);
    const acrossDone = (mid.x - sim.ball.x) / (end.x - sim.ball.x);
    const downDone = (mid.y - sim.ball.y) / (end.y - sim.ball.y);
    expect(acrossDone).toBeGreaterThan(downDone);
    expect(downDone).toBeGreaterThan(0);
  });

  it("shrinks away instead of falling when the hole is seen from above", () => {
    const s = holedBallSprite(heldOnRim(), cx, cy, true, 1);
    expect(s.x).toBeCloseTo(cx, 6);
    expect(s.y).toBeCloseTo(cy, 6);
    expect(s.r).toBeLessThan(BALL_RADIUS);
  });
});
