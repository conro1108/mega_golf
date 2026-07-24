/**
 * World units <-> Matter.js units.
 *
 * Holes are authored in world units and seconds (a max launch is 540 units/sec,
 * side-view gravity is 700 units/sec²), because that is what hole geometry is
 * tuned against. Matter integrates in *pixels per timestep* and folds the
 * timestep into its own numbers, so the two need a conversion — but only three
 * constants' worth, all derived from one identity rather than tuned by feel.
 *
 * Matter's `Body.update` integrates a force as
 *
 *     Δv [units/step] = (force / mass) * delta_ms²
 *
 * and applies gravity as `force += mass * gravity * gravity.scale`. Substituting
 * delta_ms = 1000 / STEP_HZ, both conversions collapse to a factor of 1e6 and
 * neither depends on STEP_HZ — so changing the tick rate re-tunes nothing.
 */

/**
 * Physics ticks per second. 120 rather than 60 because the ball is a 3-unit
 * circle travelling up to 540 units/sec: at 60Hz that is 9 units of travel per
 * step against 8-unit-thick top-down walls, which tunnels. At 120Hz it is 4.5,
 * comfortably inside every wall in the game. Matter has no CCD, so this margin
 * is the only thing preventing it.
 */
export const STEP_HZ = 120;

/** Milliseconds per physics tick — the fixed delta handed to the Runner. */
export const STEP_MS = 1000 / STEP_HZ;

/**
 * `engine.gravity.scale`, chosen so `engine.gravity` can be set to the hole's
 * acceleration vector in world units/sec² verbatim.
 */
export const GRAVITY_SCALE = 1e-6;

/**
 * Force needed, per unit of mass and per world-unit/sec of launch speed, to
 * impart that speed in a single tick. `Body.applyForce(ball, pos, dir * power *
 * ball.mass * STRIKE_FORCE)` therefore launches at exactly `power` units/sec.
 */
export const STRIKE_FORCE = STEP_HZ / 1e6;

/**
 * Matter's base delta, 1/60s. Not a tick rate — a normalisation constant.
 *
 * `Body.updateVelocities` scales the reported velocity by
 * `_baseDelta / body.deltaTime`, and `frictionAir` is divided by the same
 * ratio before it is applied. So both of those are expressed per 1/60s no
 * matter what `STEP_HZ` is, while positions and forces integrate at the real
 * delta. Mixing the two up reads every speed in the game as double.
 */
const BASE_HZ = 60;

/** `body.velocity` is per 1/60s (see BASE_HZ); the game thinks in units/sec. */
export function speedOf(velocity: { x: number; y: number }): number {
  return Math.hypot(velocity.x, velocity.y) * BASE_HZ;
}

/**
 * A per-second damping rate as Matter's `frictionAir`: the fraction of
 * velocity lost per 1/60s. See BASE_HZ for why that isn't STEP_HZ.
 */
export function lieDrag(ratePerSecond: number): number {
  return ratePerSecond / BASE_HZ;
}
