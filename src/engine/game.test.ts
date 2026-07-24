/**
 * Engine tests, against synthetic holes rather than authored content.
 *
 * These replaced a golden fixture that pinned exact coordinates. Matter is an
 * iterative solver, so exact numbers aren't reproducible across machines and
 * pinning them would only produce a test that fails for no reason. What is
 * worth pinning is everything a fixture was really protecting: that the world
 * <-> Matter unit bridge is right (a shot launches at the speed it was asked
 * for, gravity accelerates at the rate the hole authored), that materials stay
 * ordered against each other, and that each rule fires when it should.
 */

import { describe, expect, it } from "vitest";
import {
  createGame,
  placeBall,
  simulateShot,
  stepGame,
  strike,
  maxPowerForLie,
  MAX_POWER,
  SAND_POWER_SCALE,
} from "./game";
import { speedOf } from "./units";
import type { Hole, MaterialId } from "./world";

/** A bare hole with nothing in it but a floor rule, for measuring. */
function room(over: Partial<Hole> = {}): Hole {
  return {
    name: "test",
    idea: "test",
    par: 3,
    width: 4000,
    height: 4000,
    start: [50, 50],
    // Parked far away so the cup's capture never interferes with a measurement.
    cup: [3900, 3900],
    terrain: [],
    ...over,
  };
}

/** A top-down room whose whole floor is one material. */
function floorRoom(floor: MaterialId): Hole {
  return room({ gravity: [0, 0], floor, start: [50, 2000], cup: [3900, 100] });
}

describe("world units", () => {
  it("launches at exactly the speed the shot asked for", () => {
    // The entire STRIKE_FORCE derivation in units.ts rides on this: `power` is
    // world units per second, whatever tick rate the engine runs at.
    const game = createGame(floorRoom("ice"));
    strike(game, { angle: 0, power: 400 });
    stepGame(game);
    expect(speedOf(game.ball.velocity)).toBeCloseTo(400, 0);
  });

  it("falls at the hole's authored gravity", () => {
    // 700 units/sec² for a quarter second is 175 units/sec, less a little air
    // drag on a ball touching nothing.
    const game = createGame(room({ gravity: [0, 700] }));
    placeBall(game, 2000, 100);
    for (let i = 0; i < 30; i++) stepGame(game);
    expect(speedOf(game.ball.velocity)).toBeGreaterThan(170);
    expect(speedOf(game.ball.velocity)).toBeLessThan(178);
  });

  it("does not fall at all in a top-down hole", () => {
    const game = createGame(floorRoom("green"));
    placeBall(game, 2000, 2000);
    for (let i = 0; i < 60; i++) stepGame(game);
    expect(game.ball.position.y).toBeCloseTo(2000, 4);
  });
});

describe("materials", () => {
  /** How far a full-power shot rolls across a floor of this material. */
  function carry(floor: MaterialId): number {
    const hole = floorRoom(floor);
    const game = createGame(hole);
    const r = simulateShot(game, { angle: 0, power: MAX_POWER });
    return r.x - hole.start[0];
  }

  it("orders the surfaces the way the course is designed around", () => {
    const sand = carry("sand");
    const green = carry("green");
    const ice = carry("ice");
    expect(sand).toBeLessThan(green);
    expect(green).toBeLessThan(ice);
    // Ice is meant to read as *fast and dangerous*, not marginally slicker.
    expect(ice).toBeGreaterThan(green * 1.5);
    // And sand is meant to be a penalty you play out of, not a wall.
    expect(sand).toBeGreaterThan(10);
  });

  it("gives green roughly the carry its rolling friction predicts", () => {
    // An exponential decay at rate r stops a launch of speed v after v/r; the
    // top-down holes are sized against that number, so drift here silently
    // re-tunes every one of them.
    expect(carry("green")).toBeGreaterThan(240);
    expect(carry("green")).toBeLessThan(340);
  });

  it("caps the swing available from a sand lie", () => {
    expect(maxPowerForLie("sand")).toBeCloseTo(MAX_POWER * SAND_POWER_SCALE, 6);
    expect(maxPowerForLie("green")).toBe(MAX_POWER);
    expect(maxPowerForLie(undefined)).toBe(MAX_POWER);
  });
});

describe("coming to rest", () => {
  it("settles, and stays settled", () => {
    const game = createGame(floorRoom("green"));
    const r = simulateShot(game, { angle: 0, power: 200 });
    expect(r.state).toBe("resting");
    const stopped = { ...game.ball.position };
    for (let i = 0; i < 300; i++) stepGame(game);
    expect(game.ball.position.x).toBeCloseTo(stopped.x, 6);
    expect(game.ball.position.y).toBeCloseTo(stopped.y, 6);
  });

  it("ignores a second strike while the ball is still moving", () => {
    const game = createGame(floorRoom("ice"));
    strike(game, { angle: 0, power: 400 });
    stepGame(game);
    strike(game, { angle: Math.PI, power: 400 });
    expect(game.strokes).toBe(1);
    expect(game.ball.velocity.x).toBeGreaterThan(0);
  });
});

describe("the cup", () => {
  it("takes a ball that arrives slowly", () => {
    const hole = floorRoom("green");
    // Green sheds ~1.75 units/sec of speed per unit travelled, so over the 250
    // units to the cup this arrives at a trickle — which is what should drop.
    const game = createGame({ ...hole, cup: [300, 2000] });
    const r = simulateShot(game, { angle: 0, power: 470 });
    expect(r.state).toBe("holed");
  });

  it("lips out a ball travelling too fast to drop", () => {
    const hole = floorRoom("ice");
    // Ice barely slows the ball, so it crosses the cup at full speed.
    const game = createGame({ ...hole, cup: [300, 2000] });
    const r = simulateShot(game, { angle: 0, power: MAX_POWER });
    expect(r.state).toBe("resting");
    expect(r.x).toBeGreaterThan(400);
  });
});

describe("hazards and bounds", () => {
  const hazardRoom = (): Hole => ({
    ...floorRoom("green"),
    start: [50, 2000],
    hazards: [{ points: [[200, 1900], [400, 1900], [400, 2100], [200, 2100]] }],
  });

  it("charges a stroke and puts the ball back where it was safe", () => {
    const game = createGame(hazardRoom());
    const r = simulateShot(game, { angle: 0, power: 300 });
    // One for the shot, one for getting wet.
    expect(r.strokes).toBe(2);
    expect(r.state).toBe("resting");
    expect(game.ball.position.x).toBeCloseTo(50, 4);
    expect(game.ball.position.y).toBeCloseTo(2000, 4);
  });

  it("charges the hazard's own penalty when it names one", () => {
    const base = hazardRoom();
    const game = createGame({
      ...base,
      hazards: [{ points: base.hazards![0].points, penalty: 3 }],
    });
    expect(simulateShot(game, { angle: 0, power: 300 }).strokes).toBe(4);
  });

  it("treats leaving the world the same way", () => {
    const hole = room({ gravity: [0, 700], width: 400, height: 400, start: [200, 100] });
    const game = createGame(hole);
    const r = simulateShot(game, { angle: Math.PI / 2, power: 400 });
    expect(r.strokes).toBe(2);
    expect(game.ball.position.y).toBeCloseTo(100, 4);
  });

  it("banks a checkpoint, so a later hazard resets there instead", () => {
    const base = hazardRoom();
    const game = createGame({
      ...base,
      // Sits before the water; passing through it moves the reset point.
      checkpoints: [{ x: 130, y: 2000, radius: 20 }],
    });
    const r = simulateShot(game, { angle: 0, power: 300 });
    expect(game.checkpointsHit[0]).toBe(true);
    expect(r.strokes).toBe(2);
    expect(game.ball.position.x).toBeCloseTo(130, 4);
  });
});

describe("zones", () => {
  it("overrides the floor material inside their bounds", () => {
    // Same shot, same floor, but the second half of the run is sand: it has to
    // stop earlier than it would on green all the way.
    const base = floorRoom("green");
    const plain = simulateShot(createGame(base), { angle: 0, power: MAX_POWER });
    const zoned = simulateShot(
      createGame({
        ...base,
        zones: [{ points: [[150, 1900], [3000, 1900], [3000, 2100], [150, 2100]], floor: "sand" }],
      }),
      { angle: 0, power: MAX_POWER },
    );
    expect(zoned.x).toBeLessThan(plain.x);
  });

  it("takes the first matching zone, so authoring order is z-order", () => {
    const base = floorRoom("green");
    const span = (floor: MaterialId) => ({
      points: [[150, 1900], [3000, 1900], [3000, 2100], [150, 2100]] as const,
      floor,
    });
    const iceFirst = simulateShot(
      createGame({ ...base, zones: [span("ice"), span("sand")] }),
      { angle: 0, power: MAX_POWER },
    );
    const sandFirst = simulateShot(
      createGame({ ...base, zones: [span("sand"), span("ice")] }),
      { angle: 0, power: MAX_POWER },
    );
    expect(iceFirst.x).toBeGreaterThan(sandFirst.x);
  });
});

describe("terrain", () => {
  it("bounces off a wall instead of passing through it", () => {
    const game = createGame({
      ...floorRoom("green"),
      terrain: [{ material: "rubber", points: [[600, 1800], [640, 1800], [640, 2200], [600, 2200]] }],
    });
    const r = simulateShot(game, { angle: 0, power: MAX_POWER });
    expect(r.x).toBeLessThan(600);
  });

  it("does not let a fast ball tunnel through a thin wall", () => {
    // 8 units is the thinnest wall in the game (every top-down room is boxed
    // in by them) and MAX_POWER is the fastest anything moves.
    const game = createGame({
      ...floorRoom("ice"),
      terrain: [{ material: "rubber", points: [[600, 1800], [608, 1800], [608, 2200], [600, 2200]] }],
    });
    const r = simulateShot(game, { angle: 0, power: MAX_POWER });
    expect(r.x).toBeLessThan(600);
  });
});
