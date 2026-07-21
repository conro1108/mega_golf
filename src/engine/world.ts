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
  /** Per-second tangential velocity decay while in contact. */
  friction: number;
}

export const MATERIALS: Record<MaterialId, Material> = {
  green: { restitution: 0.42, friction: 2.6 },
  sand: { restitution: 0.05, friction: 14 },
  ice: { restitution: 0.35, friction: 0.15 },
  rubber: { restitution: 0.88, friction: 2.0 },
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

export const DEFAULT_GRAVITY: readonly [number, number] = [0, 620];

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
