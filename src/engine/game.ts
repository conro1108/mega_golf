/**
 * A hole in progress: a Matter.js engine plus the rules of minigolf.
 *
 * Matter owns everything physical — position, velocity, contacts, collision
 * response. This module owns only what Matter has no opinion about: strokes,
 * whether the ball is in the cup, which sub-cups have been banked, and what
 * happens when you find water. Those hang off Matter's own event stream
 * (`beforeUpdate`, `collisionStart`, `afterUpdate`) rather than off a
 * hand-written step function.
 *
 * Two things have to happen at the right point in Matter's update cycle:
 *
 * - **Forces are cleared at the end of every `Engine.update`**, after collision
 *   events fire. So anything that pushes the ball — gravity's zone override,
 *   the cup's pull — is applied in `beforeUpdate`, and collision handlers only
 *   record that it *should* be.
 * - **Position is not safe to mutate mid-solve.** A hazard or an out-of-bounds
 *   reset is therefore queued by the event and carried out in `afterUpdate`.
 */

import Matter from "matter-js";
import {
  DEFAULT_GRAVITY,
  MATERIALS,
  zoneAt,
  type Hole,
  type MaterialId,
  type Shot,
} from "./world";
import { BALL_RADIUS, CUP_RADIUS, LABEL, createBall, createHoleBodies, dataOf } from "./bodies";
import { GRAVITY_SCALE, STEP_HZ, STEP_MS, STRIKE_FORCE, lieDrag, speedOf } from "./units";

const { Body, Composite, Engine, Events, Runner, Sleeping, Vector } = Matter;

/**
 * Fastest a clean lie can launch the ball; the input layer maps drag onto this.
 * Tuned together with DEFAULT_GRAVITY: power² / gravity fixes the carry of a
 * max launch, so raising both in proportion keeps every hole's geometry
 * reachable while making the flight play out faster.
 */
export const MAX_POWER = 540;

/**
 * How much of a full swing a sand lie leaves you. Modest, because sand's own
 * friction is what punishes a bunker — cap the escape shot as well and the
 * ball can end up unable to leave the bunker at all.
 */
export const SAND_POWER_SCALE = 0.85;

/** Fastest launch available from the lie the ball is currently sitting on. */
export function maxPowerForLie(material: MaterialId | undefined): number {
  return material === "sand" ? MAX_POWER * SAND_POWER_SCALE : MAX_POWER;
}

/** Air drag on a ball that is touching nothing, so an arc stays near-ballistic. */
const AIR_DRAG = lieDrag(0.06);

/** Only a slow-enough ball is captured by the cup; a fast one is meant to lip out. */
const CAPTURE_SPEED = 150;
/** Pull toward cup centre, in units/sec², applied while inside the cup sensor. */
const CAPTURE_ACCEL = 900;

/** Below this speed, and in contact, the ball is a candidate for settling. */
const REST_SPEED = 7;
/** Consecutive resting steps required before the ball is declared settled. */
const REST_STEPS = 14;
/** Hard cap so a pathological shot can't spin forever in a test. */
const MAX_STEPS = STEP_HZ * 45;

export type BallState = "moving" | "resting" | "holed";

export interface Game {
  hole: Hole;
  engine: Matter.Engine;
  runner: Matter.Runner;
  ball: Matter.Body;
  state: BallState;
  /** Steps elapsed since the shot was struck; drives f(hole_time) elements. */
  steps: number;
  strokes: number;
  /** Where the ball last came to rest — the reset point after going out. */
  safe: Matter.Vector;
  /** Sub-cups already banked this attempt, in `hole.checkpoints` order. */
  checkpointsHit: boolean[];
  /** Whether the ball is touching ground this step. Drives drag and the juice. */
  contact: boolean;
  /** The material last under the ball — the "lie" a shot is played from. */
  groundMaterial: MaterialId | undefined;
  /** Set while the ball overlaps the cup sensor; drives the capture pull. */
  nearCup: boolean;
  restCounter: number;
  /** Strokes owed from a hazard hit, resolved after the solver finishes. */
  pendingPenalty: number;
}

export function createGame(hole: Hole): Game {
  const engine = Engine.create({ enableSleeping: false });
  // Matter's gravity is `mass * gravity * gravity.scale`; picking the scale
  // this way lets `engine.gravity` be the hole's acceleration vector in world
  // units/sec² verbatim. See units.ts.
  engine.gravity.scale = GRAVITY_SCALE;

  const ball = createBall(hole.start[0], hole.start[1]);
  Composite.add(engine.world, [...createHoleBodies(hole), ball]);

  const game: Game = {
    hole,
    engine,
    ball,
    runner: Runner.create({ delta: STEP_MS }),
    state: "resting",
    steps: 0,
    strokes: 0,
    safe: Vector.create(hole.start[0], hole.start[1]),
    checkpointsHit: new Array(hole.checkpoints?.length ?? 0).fill(false),
    contact: false,
    groundMaterial: undefined,
    nearCup: false,
    restCounter: 0,
    pendingPenalty: 0,
  };

  Events.on(engine, "beforeUpdate", () => applyForces(game));
  Events.on(engine, "collisionStart", (e) => onCollision(game, e.pairs, true));
  Events.on(engine, "collisionActive", (e) => onCollision(game, e.pairs, false));
  Events.on(engine, "collisionEnd", (e) => onCollisionEnd(game, e.pairs));
  Events.on(engine, "afterUpdate", () => resolveRules(game));

  return game;
}

/** Free the engine's bodies and stop its runner. Call before dropping a Game. */
export function destroyGame(game: Game): void {
  Runner.stop(game.runner);
  Composite.clear(game.engine.world, false);
  Engine.clear(game.engine);
}

/** Start stepping this hole in real time. */
export function runGame(game: Game): void {
  Runner.run(game.runner, game.engine);
}

/** Stop stepping — leaving the title screen, or unloading the hole. */
export function pauseGame(game: Game): void {
  Runner.stop(game.runner);
}

/** Strike the ball. No-op unless it is at rest. */
export function strike(game: Game, shot: Shot): void {
  if (game.state !== "resting") return;
  Sleeping.set(game.ball, false);
  Body.setVelocity(game.ball, Vector.create(0, 0));
  Body.setAngularVelocity(game.ball, 0);
  // Scaled by mass and STRIKE_FORCE so `shot.power` lands as exactly that many
  // world units/sec of launch speed after one tick — see units.ts.
  const f = game.ball.mass * shot.power * STRIKE_FORCE;
  Body.applyForce(game.ball, game.ball.position, {
    x: Math.cos(shot.angle) * f,
    y: Math.sin(shot.angle) * f,
  });
  game.state = "moving";
  game.steps = 0;
  game.strokes += 1;
  game.restCounter = 0;
}

/**
 * Everything that pushes the ball, applied before Matter integrates.
 *
 * Also the one place gravity and drag are chosen, because both depend on where
 * the ball is: a zone can override gravity or name a different floor, and drag
 * depends on whether the ball is rolling on something or flying through air.
 */
function applyForces(game: Game): void {
  const { ball, hole } = game;
  if (game.state !== "moving") return;

  const zone = zoneAt(hole, ball.position.x, ball.position.y);
  const g = zone?.gravity ?? hole.gravity ?? DEFAULT_GRAVITY;
  game.engine.gravity.x = g[0];
  game.engine.gravity.y = g[1];

  // A top-down hole names a floor instead of standing the ball on geometry, so
  // the ball is in contact everywhere within it. Side-view holes leave `floor`
  // unset and take their contact from the collision events instead.
  const floor = zone?.floor ?? hole.floor;
  if (floor !== undefined) {
    game.contact = true;
    game.groundMaterial = floor;
  }

  ball.frictionAir =
    game.contact && game.groundMaterial !== undefined
      ? lieDrag(MATERIALS[game.groundMaterial].rollingFriction)
      : AIR_DRAG;

  // Magnetic capture: once a slow-enough ball is over the cup, pull it toward
  // centre so it visibly rolls in and disappears there over a handful of steps,
  // rather than freezing wherever it happened to cross the rim.
  if (game.nearCup && speedOf(ball.velocity) < CAPTURE_SPEED) {
    const to = Vector.sub(Vector.create(hole.cup[0], hole.cup[1]), ball.position);
    const d = Vector.magnitude(to);
    if (d > 0) {
      // Same identity as gravity: a force of `mass * a * GRAVITY_SCALE`
      // produces an acceleration of `a` world units/sec².
      const f = ball.mass * CAPTURE_ACCEL * GRAVITY_SCALE;
      Body.applyForce(ball, ball.position, Vector.mult(Vector.div(to, d), f));
    }
  }

  // Contact is re-established from scratch each step by the collision events;
  // a floor (above) re-asserts itself next step.
  if (floor === undefined) game.contact = false;
}

/**
 * The other body in a pair involving the ball, or null if the ball isn't in it.
 *
 * Matter pairs name the colliding *parts*, and a concave terrain silhouette is
 * a compound of many — so resolve to the parent, which is where the label and
 * material live.
 */
function otherBody(game: Game, pair: Matter.Pair): Matter.Body | null {
  const a = pair.bodyA.parent ?? pair.bodyA;
  const b = pair.bodyB.parent ?? pair.bodyB;
  if (a === game.ball) return b;
  if (b === game.ball) return a;
  return null;
}

function onCollision(game: Game, pairs: Matter.Pair[], started: boolean): void {
  for (const pair of pairs) {
    const other = otherBody(game, pair);
    if (!other) continue;
    const data = dataOf(other);

    switch (other.label) {
      case LABEL.terrain:
        game.contact = true;
        if (data.material) game.groundMaterial = data.material;
        break;
      case LABEL.cup:
        game.nearCup = true;
        break;
      case LABEL.checkpoint:
        if (started && data.index !== undefined && !game.checkpointsHit[data.index]) {
          game.checkpointsHit[data.index] = true;
          const c = game.hole.checkpoints![data.index];
          game.safe = Vector.create(c.x, c.y);
        }
        break;
      case LABEL.hazard:
        if (started) game.pendingPenalty += data.penalty ?? 1;
        break;
    }
  }
}

function onCollisionEnd(game: Game, pairs: Matter.Pair[]): void {
  for (const pair of pairs) {
    const other = otherBody(game, pair);
    if (other?.label === LABEL.cup) game.nearCup = false;
  }
}

/**
 * The rules, run once the solver has finished and the ball's position for this
 * step is final: hole-out, hazards, out of bounds, and coming to rest.
 */
function resolveRules(game: Game): void {
  if (game.state !== "moving") return;
  const { ball, hole } = game;
  game.steps += 1;

  if (game.pendingPenalty > 0) {
    game.strokes += game.pendingPenalty;
    game.pendingPenalty = 0;
    resetToSafe(game);
    return;
  }

  const speed = speedOf(ball.velocity);
  const toCup = Vector.magnitude(
    Vector.sub(Vector.create(hole.cup[0], hole.cup[1]), ball.position),
  );
  if (toCup < CUP_RADIUS && speed < CAPTURE_SPEED) {
    settle(game);
    game.state = "holed";
    return;
  }

  if (
    ball.position.y > hole.height + 40 ||
    ball.position.x < -40 ||
    ball.position.x > hole.width + 40
  ) {
    // Water / void: stroke penalty, back to the last rest position.
    game.strokes += 1;
    resetToSafe(game);
    return;
  }

  if (game.contact && speed < REST_SPEED) {
    game.restCounter += 1;
    if (game.restCounter >= REST_STEPS) settle(game);
  } else {
    game.restCounter = 0;
  }

  if (game.steps >= MAX_STEPS) settle(game);
}

function resetToSafe(game: Game): void {
  Body.setPosition(game.ball, Vector.clone(game.safe));
  settle(game);
}

/**
 * Bring the ball to a stop and park it there.
 *
 * `Sleeping.set` rather than just zeroing velocity: a settled ball on a slope
 * would otherwise be pulled straight back into motion by gravity on the next
 * step, and creep downhill for the rest of the hole.
 */
function settle(game: Game): void {
  Body.setVelocity(game.ball, Vector.create(0, 0));
  Body.setAngularVelocity(game.ball, 0);
  Sleeping.set(game.ball, true);
  game.state = "resting";
  game.restCounter = 0;
  game.safe = Vector.clone(game.ball.position);
}

export interface ShotResult {
  x: number;
  y: number;
  steps: number;
  state: BallState;
  strokes: number;
}

/**
 * Run a shot to completion, off the clock. This is the headless primitive the
 * hole tests use: strike, then drive the engine directly rather than through
 * the Runner, so no wall-clock time is involved.
 */
export function simulateShot(game: Game, shot: Shot): ShotResult {
  strike(game, shot);
  let guard = 0;
  while (game.state === "moving" && guard++ < MAX_STEPS + 10) {
    Engine.update(game.engine, STEP_MS);
  }
  return {
    x: game.ball.position.x,
    y: game.ball.position.y,
    steps: game.steps,
    state: game.state,
    strokes: game.strokes,
  };
}

/** Advance one fixed physics step, for headless use. */
export function stepGame(game: Game): void {
  Engine.update(game.engine, STEP_MS);
}

/** Place the ball somewhere and let physics take over — test and setup helper. */
export function placeBall(game: Game, x: number, y: number): void {
  Sleeping.set(game.ball, false);
  Body.setPosition(game.ball, Vector.create(x, y));
  Body.setVelocity(game.ball, Vector.create(0, 0));
  Body.setAngularVelocity(game.ball, 0);
  game.safe = Vector.create(x, y);
  game.state = "moving";
  game.steps = 0;
  game.restCounter = 0;
}

export { BALL_RADIUS, CUP_RADIUS };
