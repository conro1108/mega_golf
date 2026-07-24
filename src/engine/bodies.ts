/**
 * Hole data -> Matter.js bodies.
 *
 * Every collider in the game is built here, and nothing else in the codebase
 * constructs one. Terrain polygons become static bodies; the cup, checkpoints
 * and hazards become static *sensors*, so "the ball entered this region" is a
 * Matter collision event rather than a per-step geometry test in game code.
 */

import Matter from "matter-js";
import decomp from "poly-decomp";
import { MATERIALS, type Hole, type MaterialId } from "./world";

const { Bodies, Body, Bounds, Common } = Matter;

// Terrain silhouettes — ridges, blobs, pockets — are concave, so
// `Bodies.fromVertices` needs a decomposition backend to build them.
Common.setDecomp(decomp);

export const BALL_RADIUS = 3;
export const CUP_RADIUS = 8;

/**
 * Labels the game logic matches collision events against. Matter has no
 * userData convention beyond `label` and `plugin`, so these are it.
 */
export const LABEL = {
  ball: "ball",
  terrain: "terrain",
  cup: "cup",
  checkpoint: "checkpoint",
  hazard: "hazard",
} as const;

/** What we hang off `body.plugin` — the material hit, or which region fired. */
export interface BodyData {
  material?: MaterialId;
  /** Index into `hole.checkpoints` / `hole.hazards`. */
  index?: number;
  penalty?: number;
}

export function dataOf(body: Matter.Body): BodyData {
  return (body.plugin ?? {}) as BodyData;
}

type Points = readonly (readonly [number, number])[];

function toVertices(points: Points): Matter.Vector[] {
  return points.map(([x, y]) => ({ x, y }));
}

/**
 * True if this polygon is an axis-aligned rectangle.
 *
 * Most top-down terrain is — room walls, dividers, stubs — and for those
 * `Bodies.rectangle` is both cheaper and more stable than pushing four points
 * through a convex decomposition, so it is worth the check.
 */
function axisAlignedRect(points: Points): { x: number; y: number; w: number; h: number } | null {
  if (points.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    if (a[0] !== b[0] && a[1] !== b[1]) return null;
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX <= 0 || maxY - minY <= 0) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/**
 * Build a static body covering a polygon, wherever the polygon actually sits.
 *
 * `Bodies.fromVertices` positions a body by its *centre of mass*, which for a
 * concave silhouette is nowhere near the centroid of its points — so building
 * at the origin and then aligning bounding boxes is the only way to land the
 * geometry back where it was authored.
 */
function polygonBody(points: Points, options: Matter.IChamferableBodyDefinition): Matter.Body | null {
  const rect = axisAlignedRect(points);
  if (rect) return Bodies.rectangle(rect.x, rect.y, rect.w, rect.h, options);

  const verts = toVertices(points);
  // `flagInternal` marks the seams the decomposition introduces so the ball
  // rolls over a ridge as one surface instead of catching on every join.
  const body = Bodies.fromVertices(0, 0, [verts], options, true);
  if (!body) return null;

  const want = Bounds.create(verts);
  Body.setPosition(body, {
    x: body.position.x + (want.min.x - body.bounds.min.x),
    y: body.position.y + (want.min.y - body.bounds.min.y),
  });
  return body;
}

function surfaceOptions(material: MaterialId): Matter.IChamferableBodyDefinition {
  const m = MATERIALS[material];
  return {
    isStatic: true,
    label: LABEL.terrain,
    restitution: m.restitution,
    friction: m.friction,
    frictionStatic: m.frictionStatic,
    plugin: { material } satisfies BodyData,
    // Rendering is entirely ours; keep Matter's debug renderer out of it.
    render: { visible: false },
  };
}

function sensor(label: string, plugin: BodyData): Matter.IChamferableBodyDefinition {
  return { isStatic: true, isSensor: true, label, plugin, render: { visible: false } };
}

/**
 * The ball.
 *
 * Matter combines a contact's material properties from the two bodies —
 * `min` for friction, `max` for restitution and static friction — so the ball
 * is deliberately built at the neutral end of each: friction 1, restitution 0,
 * frictionStatic 0. Every contact then takes its feel entirely from the
 * surface, which is what lets `MATERIALS` be read as the single source of
 * truth for how a surface plays.
 */
export function createBall(x: number, y: number): Matter.Body {
  return Bodies.circle(x, y, BALL_RADIUS, {
    label: LABEL.ball,
    restitution: 0,
    friction: 1,
    frictionStatic: 0,
    frictionAir: 0,
    // Matter's default 0.05 allowed overlap is 1.7% of a 3-unit ball, which
    // reads as the ball sinking into the ground on a slow roll.
    slop: 0.02,
    render: { visible: false },
  });
}

/** Every static body a hole is made of: terrain, then the sensor regions. */
export function createHoleBodies(hole: Hole): Matter.Body[] {
  const bodies: Matter.Body[] = [];

  for (const t of hole.terrain) {
    const body = polygonBody(t.points, surfaceOptions(t.material));
    if (body) bodies.push(body);
  }

  // The cup sensor is wider than the cup itself: it is the region in which the
  // ball is a candidate to drop, and `game.ts` pulls a slow ball toward centre
  // from inside it so it visibly rolls in rather than freezing on the rim.
  bodies.push(
    Bodies.circle(hole.cup[0], hole.cup[1], CUP_RADIUS + 3, sensor(LABEL.cup, {})),
  );

  hole.checkpoints?.forEach((c, index) => {
    bodies.push(Bodies.circle(c.x, c.y, c.radius, sensor(LABEL.checkpoint, { index })));
  });

  hole.hazards?.forEach((h, index) => {
    const body = polygonBody(h.points, sensor(LABEL.hazard, { index, penalty: h.penalty ?? 1 }));
    if (body) bodies.push(body);
  });

  return bodies;
}
