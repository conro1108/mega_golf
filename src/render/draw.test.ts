import { describe, it, expect } from "vitest";
import { holedBallSprite } from "./draw";
import { createGame, placeBall, BALL_RADIUS } from "../engine/game";
import { ALL_HOLES as HOLES } from "../holes";

/**
 * The drop-in is render-only, but it's the bit of the cup a player actually
 * watches: a ball that stops beside the hole is the exact complaint this
 * replaced. These pin the endpoints of that motion.
 */
describe("holedBallSprite", () => {
  const hole = HOLES[0];
  const [cx, cy] = hole.cup;

  function heldOnRim() {
    const game = createGame(hole);
    // Caught on the rim, off-centre and above the surface, as capture leaves it.
    placeBall(game, cx - 6, cy);
    game.state = "holed";
    return game;
  }

  it("leaves a ball that is not holed exactly where physics put it", () => {
    const game = heldOnRim();
    const s = holedBallSprite(game, cx, cy, false, 0);
    expect(s).toEqual({ x: game.ball.position.x, y: game.ball.position.y, r: BALL_RADIUS });
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
    const game = heldOnRim();
    const mid = holedBallSprite(game, cx, cy, false, 0.4);
    const end = holedBallSprite(game, cx, cy, false, 1);
    const b = game.ball.position;
    const acrossDone = (mid.x - b.x) / (end.x - b.x);
    const downDone = (mid.y - b.y) / (end.y - b.y);
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
