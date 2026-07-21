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
}

export const DEFAULT_GRAVITY: readonly [number, number] = [0, 620];

export function isTopDown(hole: Hole): boolean {
  return hole.floor !== undefined;
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
