/**
 * World data: what a hole is made of.
 *
 * Terrain is authored as closed polygons so the renderer can fill a silhouette
 * and the physics can build a body from the same points — one source of truth,
 * no separate collision layer to keep in sync. `bodies.ts` turns these into
 * Matter.js bodies.
 */

export type MaterialId = "green" | "sand" | "ice" | "rubber";

/**
 * A surface, in Matter.js's own terms — these are body options, passed
 * straight through to `Bodies.*`, not a private physics vocabulary.
 *
 * Two Matter details drive how these are tuned:
 *
 * - Contact friction is `min(ballFriction, surfaceFriction)` and restitution is
 *   `max(...)`. So the ball is built with `friction: 1, restitution: 0` and
 *   every contact takes its character entirely from the surface it hits.
 * - A Matter circle rolling on a plane has no rolling resistance — with pure
 *   Coulomb friction it rolls forever. `rollingFriction` below is what actually
 *   stops the ball; see `lieDrag` and its use in `game.ts`.
 */
export interface Material {
  /** Matter `restitution`. 0 = dead, 1 = perfectly elastic. */
  restitution: number;
  /** Matter `friction`: the Coulomb coefficient at a sliding contact. */
  friction: number;
  /** Matter `frictionStatic`, as a multiple of `friction`. Holds a ball on a slope. */
  frictionStatic: number;
  /**
   * Velocity damping applied to the *ball* while this material is under it,
   * as a per-second rate. `lieDrag` converts it to Matter's `frictionAir`.
   *
   * This is the whole reason the ball ever stops. In side-view it reads as
   * rolling resistance (applied only while in contact — an airborne ball gets
   * `AIR_DRAG` instead, so an arc stays near-ballistic and holes keep their
   * carry). In top-down it is the floor, applied every step because the ball
   * is always on one. One mechanism, both perspectives.
   *
   * Sized directly: an exponential decay at rate r stops a launch of speed v
   * after v/r units, so green's 1.75 gives a ~308-unit top-down carry from
   * MAX_POWER.
   */
  rollingFriction: number;
}

export const MATERIALS: Record<MaterialId, Material> = {
  // Green is the reference surface: enough bite to hold a settled ball on a
  // real slope (`frictionStatic`), a modest bounce so a landing feels alive
  // without skittering, and the rolling rate that sizes every hole's carry.
  green: { restitution: 0.3, friction: 0.08, frictionStatic: 0.6, rollingFriction: 1.75 },
  // Sand takes the ball's energy rather than returning any of it: a shot that
  // arrives in a bunker should stop where it pitches, not skip or trickle on.
  // It grips hardest of anything — a plugged lie stays put on a real slope.
  sand: { restitution: 0.02, friction: 0.6, frictionStatic: 1.4, rollingFriction: 13.5 },
  // Ice keeps ~2.4x a green carry, and has almost no static grip either: an
  // ice shelf sheds anything but a flat lie.
  ice: { restitution: 0.3, friction: 0.002, frictionStatic: 0.05, rollingFriction: 0.72 },
  // Bumpers return the ball's line instead of grabbing it.
  rubber: { restitution: 0.9, friction: 0.03, frictionStatic: 0.3, rollingFriction: 2.0 },
};

export interface Terrain {
  /** Closed polygon, wound clockwise in screen space (y down). */
  points: readonly (readonly [number, number])[];
  material: MaterialId;
}

/**
 * A region that overrides gravity and/or floor material while the ball's
 * centre is inside it. Checked in array order, first match wins, so authoring
 * order doubles as z-order for overlapping zones.
 */
export interface Zone {
  /** Closed polygon; interior test only, never a collider. */
  points: readonly (readonly [number, number])[];
  gravity?: readonly [number, number];
  floor?: MaterialId;
}

/** A sub-cup: banks the ball's rest/reset position without ending the hole. */
export interface Checkpoint {
  x: number;
  y: number;
  radius: number;
}

/**
 * An interior water/void region. Built as a Matter sensor, so the ball passes
 * through unobstructed and entering it only raises a collision event: a stroke
 * penalty and a reset to the last safe position.
 */
export interface Hazard {
  points: readonly (readonly [number, number])[];
  /** Strokes charged on entry. Defaults to 1. */
  penalty?: number;
}

export interface Hole {
  name: string;
  /** The one idea this hole teaches. If you can't name it, cut the hole. */
  idea: string;
  par: number;
  width: number;
  height: number;
  start: readonly [number, number];
  cup: readonly [number, number];
  terrain: readonly Terrain[];
  /**
   * Perspective, expressed as physics rather than as a mode flag.
   *
   * Side-view holes fall (the default). Top-down holes set gravity to zero and
   * name a `floor` material instead — the ball is then always in contact with
   * the ground, so that material's `rollingFriction` is what slows it down.
   * One engine serves both; see DESIGN.md "Two perspectives".
   */
  gravity?: readonly [number, number];
  /** Set for top-down holes: the surface the ball rolls across everywhere. */
  floor?: MaterialId;
  /** Regions that override gravity/floor locally. See `Zone`. */
  zones?: readonly Zone[];
  checkpoints?: readonly Checkpoint[];
  hazards?: readonly Hazard[];
}

/**
 * Side-view gravity, in world units per second squared. The game is skee-ball,
 * not golf, so a launch should arc across most of a hole rather than pitch and
 * roll — a max shot lobs ~104 units high and carries ~416, about one screen,
 * and holes are sized to one or two of those. Top-down holes set `[0, 0]`.
 */
export const DEFAULT_GRAVITY: readonly [number, number] = [0, 700];

/** Ray-casting point-in-polygon test, for the zone and material lookups. */
export function pointInPolygon(px: number, py: number, points: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** The zone (if any) whose interior contains this point, in authoring order. */
export function zoneAt(hole: Hole, x: number, y: number): Zone | undefined {
  if (!hole.zones) return undefined;
  for (let i = 0; i < hole.zones.length; i++) {
    if (pointInPolygon(x, y, hole.zones[i].points)) return hole.zones[i];
  }
  return undefined;
}

/**
 * The material of the terrain body under a point.
 *
 * Content authors a patch — a bunker, an ice sheet — as a polygon laid *on top
 * of* the fairway slab, sharing its top edge exactly. Later polygons win,
 * matching the renderer's painter's order: the patch you can see on top is the
 * one you feel. This is a lookup for rendering and for the *lie* a shot is
 * played from; collision itself reads the material off the body that was hit.
 */
export function terrainMaterialAt(
  hole: Hole,
  x: number,
  y: number,
  fallback: MaterialId,
): MaterialId {
  let found = fallback;
  for (let i = 0; i < hole.terrain.length; i++) {
    if (pointInPolygon(x, y, hole.terrain[i].points)) found = hole.terrain[i].material;
  }
  return found;
}

/** A hole is top-down if the cup sits under a floor, whether hole-wide or a local zone. */
export function isTopDown(hole: Hole): boolean {
  if (hole.floor !== undefined) return true;
  const z = zoneAt(hole, hole.cup[0], hole.cup[1]);
  return z?.floor !== undefined;
}

/** A recorded shot. This is the entire payload a ghost putt needs. */
export interface Shot {
  /** Radians, screen space (y down). */
  angle: number;
  /** Launch speed in world units/sec. */
  power: number;
}
