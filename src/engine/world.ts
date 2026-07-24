/**
 * World data: what a hole is made of.
 *
 * Terrain is authored as closed polygons so the renderer can fill a silhouette
 * and the simulation can walk the same edges — one source of truth, no
 * separate collision layer to keep in sync.
 */

export type MaterialId = "green" | "sand" | "ice" | "rubber";

export interface Material {
  /** Bounce along the contact normal. 0 = dead, 1 = perfectly elastic. */
  restitution: number;
  /** Per-second tangential velocity decay while in wall/edge contact. */
  friction: number;
  /**
   * Fraction of tangential speed *kept* across a real impact (one whose
   * approach speed clears IMPACT_SPEED in sim.ts). Per-second friction can't
   * scrub a bounce — contact lasts a substep or two — so without this a
   * landing kept nearly all its horizontal speed and skipped on forever.
   * Defaults to 1 (no scrub): a bumper should return the ball, not grab it.
   */
  bounceGrip?: number;
  /**
   * Static friction, as the steepest slope that holds a stationary ball —
   * expressed as rise over run, so 0.36 is about 20 degrees.
   *
   * Without this the only force opposing gravity on a slope is viscous drag,
   * whose equilibrium creep speed is `g * sin(slope) / friction`. On green
   * that puts the steepest ball-holding ground at *2.5 degrees*: every hill
   * shed the ball, and a domed island could not hold one anywhere, because a
   * dome's flat spot is a single unstable point. Landing zones were
   * unwinnable rather than difficult.
   *
   * Omit for a material that should never hold a stationary ball on a slope.
   */
  grip?: number;
  /**
   * Per-second velocity decay while this material is a top-down *floor*
   * (see `step()` in sim.ts). Defaults to `friction` if unset.
   *
   * This is a separate number on purpose: `friction` fires only during edge
   * contact (a bounce, or the brief re-penetration of a ball resting against
   * a slope), while a top-down floor decays the ball's full velocity every
   * single step, unconditionally, for as long as it's on that floor. The
   * same numeric value reads very differently through those two mechanisms,
   * which is exactly why reusing one constant made green feel slippery underfoot
   * in side-view but sticky as a top-down floor, and why the game had no
   * consistent way to tune the two roles independently.
   */
  rollingFriction?: number;
}

export const MATERIALS: Record<MaterialId, Material> = {
  // Two of these numbers steer side-view; one steers top-down, and they don't
  // cross. `friction` fires on edge contact — every side-view roll and bounce;
  // `rollingFriction` fires only under a top-down floor (sim.ts). Green is
  // never a terrain *edge* in a top-down room (the walls are rubber, green is
  // just the floor), so tuning `friction`/`restitution`/`bounceGrip` is a
  // side-view-only lever and `rollingFriction` a top-down-only one.
  //
  // Side-view used to play like mud: `friction` 4.2 killed a roll so fast that
  // the ground's *shape* never got to steer the ball — you dialed power and
  // watched it trundle to a stop. 3.0 lets a landing carry and a slope redirect,
  // so reading angles and banks starts to matter, which is the point. Bounce
  // stays modest (0.3, up from 0.25) — enough to feel alive without the ~360-unit
  // skitter that 0.42 gave, which would drown the drop-in pockets. bounceGrip up
  // to 0.8 so a bank returns the ball's line instead of grabbing it. `grip`
  // (static) unchanged, so slopes still hold a settled ball. `rollingFriction`
  // held at 1.75: it sizes every top-down green hole's carry, and those holes
  // are tuned to it — dropping it would silently overshoot all of them.
  green: { restitution: 0.3, friction: 3.0, rollingFriction: 1.75, bounceGrip: 0.8, grip: 0.36 },
  // Sand takes the ball's energy rather than returning any of it: a shot that
  // arrives in a bunker should stop where it pitches, not skip or trickle on.
  // It grips hardest of anything — a plugged lie stays put on a real slope.
  sand: { restitution: 0.02, friction: 28, rollingFriction: 13.5, bounceGrip: 0.25, grip: 0.7 },
  // Ice rolling friction sets the top-down ice carry: at 0.3 a full-power shot
  // rolled for fourteen seconds, which is not "fast and dangerous", just slow
  // to watch. 0.72 keeps ice at ~2.4x a green carry with a watchable stop.
  // Almost no static grip either: an ice shelf sheds anything but a flat lie.
  ice: { restitution: 0.3, friction: 0.55, rollingFriction: 0.72, grip: 0.05 },
  rubber: { restitution: 0.88, friction: 2.0, grip: 0.3 },
};

export interface Terrain {
  /** Closed polygon, wound clockwise in screen space (y down). */
  points: readonly (readonly [number, number])[];
  material: MaterialId;
}

/**
 * A region that overrides gravity and/or floor material while the ball's
 * centre is inside it. This is how one hole can *change* perspective
 * partway through (the mega hole's whole trick): the hole-level gravity/floor
 * are just the default zone. Checked in array order, first match wins, so
 * authoring order doubles as z-order for overlapping zones.
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
 * An interior water/void region. Unlike terrain, this isn't a collider — the
 * ball passes through unobstructed until its centre enters, at which point
 * it's treated like going out of bounds: a stroke penalty and a reset to the
 * last safe position. Use this for a hazard that sits mid-fairway rather than
 * at the world edge.
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
   * Side-view holes fall (the default). Top-down holes set gravity to zero
   * and name a `floor` material instead — the ball is then always in contact
   * with the ground, so that material's friction is what slows it down. One
   * simulation serves both; see DESIGN.md "Two perspectives".
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
 * Side-view gravity. The game is skee-ball, not golf, so a launch should arc
 * across most of a hole rather than pitch and roll — a max shot lobs ~104
 * units high and carries ~416, about one screen, and holes are sized to one or
 * two of those. Raised from 440 in proportion with MAX_POWER (which preserves
 * exactly those numbers) because at 440 a full arc hung for 1.4 seconds and
 * the game played underwater. Top-down holes set their own `[0, 0]`.
 */
export const DEFAULT_GRAVITY: readonly [number, number] = [0, 700];

/** Ray-casting point-in-polygon test. Pure comparisons and division: exact. */
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

/** How far beneath a contact point to sample for the terrain body underneath it. */
export const MATERIAL_PROBE = 1;

/**
 * The material of the terrain body under a contact point.
 *
 * Content authors a patch — a bunker, an ice sheet — as a polygon laid *on top
 * of* the fairway slab, sharing its top edge exactly. The collision pass walks
 * edges, and once the fairway's edge has depenetrated the ball to exactly one
 * radius, the patch's coincident edge is no longer penetrating, so it is
 * skipped entirely: every bunker in the game was physically green, however the
 * ball bounced and rolled through it. Rather than making coincident edges both
 * fire (which would double up friction wherever two walls abut flush — the
 * other half of the content), resolve the material by *region*: sample just
 * beneath the surface and take the body found there.
 *
 * Later polygons win, matching the renderer's painter's order — the patch you
 * can see on top is the one you feel.
 *
 * Pure comparisons and division, so it stays replay-exact.
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

export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  material: MaterialId;
}

/** Flatten a hole's polygons into the edge list the simulation collides against. */
export function buildEdges(hole: Hole): Edge[] {
  const edges: Edge[] = [];
  for (const t of hole.terrain) {
    const n = t.points.length;
    for (let i = 0; i < n; i++) {
      const a = t.points[i];
      const b = t.points[(i + 1) % n];
      edges.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], material: t.material });
    }
  }
  return edges;
}
