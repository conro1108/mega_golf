/**
 * Curve authoring for holes.
 *
 * Terrain is a polygon and Matter builds a body from its points, so a "curve"
 * here is a polyline dense enough to read as one — the engine never learns a
 * new primitive, and collision and materials are untouched.
 *
 * ## Why the sampling is coarse
 *
 * Vertices are spaced around a ball diameter apart rather than every pixel.
 * Denser than that and `Bodies.fromVertices` decomposes the silhouette into
 * far more parts than the shape needs, and the near-collinear ones are exactly
 * where a rolling ball catches. The renderer rounds corners at this scale
 * anyway (`traceShape`), so a ~14-unit chord draws as a genuine curve.
 */

import { BALL_RADIUS } from "../engine/bodies";
import type { MaterialId, Terrain } from "../engine/world";

export type Pt = readonly [number, number];

/** Default chord length between sampled vertices, in world units. */
export const SPACING = 14;

/**
 * Catmull-Rom through every control point, sampled into a polyline.
 *
 * The curve passes through the controls themselves, so authoring stays direct:
 * the points you write are points the ground goes through. Ends are clamped
 * (the first and last control are doubled) so an open curve starts and stops
 * exactly where it's told.
 *
 * A sharp direction change between controls can make the spline overshoot
 * slightly past them — spread controls out rather than fighting it.
 */
export function smooth(controls: readonly Pt[], spacing: number = SPACING, closed = false): Pt[] {
  if (controls.length < 3) return controls.map((p) => [p[0], p[1]] as Pt);

  const n = controls.length;
  const at = (i: number): Pt => {
    if (closed) return controls[((i % n) + n) % n];
    return controls[i < 0 ? 0 : i > n - 1 ? n - 1 : i];
  };

  const out: Pt[] = [];
  const last = closed ? n - 1 : n - 2;
  for (let i = 0; i <= last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const chord = Math.sqrt(dx * dx + dy * dy);
    let steps = Math.round(chord / spacing);
    if (steps < 1) steps = 1;

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  if (!closed) out.push([controls[n - 1][0], controls[n - 1][1]]);
  return out;
}

/**
 * One axis of a uniform Catmull-Rom at `t` in [0, 1].
 *
 * Written out as sums and products on purpose: `+ - *` and multiplication by
 * 0.5 are exact in IEEE-754, so two machines agree on the result bit for bit.
 */
function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
  );
}

/**
 * A closed ground polygon from a top profile: the surface curves through the
 * controls, then drops straight down to `baseline` and back. This is the
 * rolling-fairway primitive — most side-view holes are one of these.
 */
export function ridge(
  material: MaterialId,
  top: readonly Pt[],
  baseline: number,
  spacing: number = SPACING,
): Terrain {
  const surface = smooth(top, spacing);
  // A profile that doubles back in x has an overhang the ball can catch under
  // from the inside, which reads as the ground grabbing it for no reason. The
  // spline overshoots when controls turn too sharply, so this fires at module
  // load — at authoring time — rather than as a mystery bounce months later.
  for (let i = 0; i < surface.length - 1; i++) {
    if (surface[i + 1][0] <= surface[i][0]) {
      throw new Error(
        `ridge profile doubles back near x=${surface[i][0]}: spread the controls out`,
      );
    }
  }
  const first = surface[0];
  const lastPt = surface[surface.length - 1];
  return {
    material,
    points: [...surface, [lastPt[0], baseline], [first[0], baseline]],
  };
}

/**
 * A different material occupying part of an existing ridge — a bunker in a
 * hollow, an ice sheet across a shoulder.
 *
 * It is cut from the ridge's *own sampled vertices*, so the two surfaces are
 * coincident to the bit rather than nearly-coincident. That matters: contact
 * material resolves by sampling the body under the surface (`terrainMaterialAt`),
 * and a patch whose lip sits a hair proud of the fairway is a lip the ball can
 * catch on. List the patch after the ridge — later polygons win, both for what
 * you see and for what you feel.
 */
export function patch(
  material: MaterialId,
  surface: readonly Pt[],
  fromX: number,
  toX: number,
  baseline: number,
): Terrain {
  const span = surface.filter((p) => p[0] >= fromX && p[0] <= toX);
  if (span.length < 2) throw new Error(`patch ${fromX}..${toX} covers no surface samples`);
  return {
    material,
    points: [...span, [span[span.length - 1][0], baseline], [span[0][0], baseline]],
  };
}

/**
 * A curved wall of constant thickness: the spine, offset to both sides. This
 * is the top-down counterpart to `ridge` — a banked barrier you play angles
 * off, rather than one more axis-aligned box.
 *
 * Keep the curvature gentle relative to `halfWidth`; a hairpin makes the inner
 * offset cross itself, and a self-crossing collider behaves like a trap.
 */
export function thickCurve(controls: readonly Pt[], halfWidth: number, spacing: number = SPACING): Pt[] {
  const spine = smooth(controls, spacing);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < spine.length; i++) {
    const a = spine[i === 0 ? 0 : i - 1];
    const b = spine[i === spine.length - 1 ? i : i + 1];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len === 0) continue;
    const nx = -ty / len;
    const ny = tx / len;
    left.push([spine[i][0] + nx * halfWidth, spine[i][1] + ny * halfWidth]);
    right.push([spine[i][0] - nx * halfWidth, spine[i][1] - ny * halfWidth]);
  }
  return [...left, ...right.reverse()];
}

/** A flat slab of ground: a launch pad or a landing platform to arc between. */
export function platform(
  x1: number,
  x2: number,
  topY: number,
  baseline: number,
  material: MaterialId = "green",
): Terrain {
  return { material, points: [[x1, topY], [x2, topY], [x2, baseline], [x1, baseline]] };
}

/** Left and right bumpers, the standing walls of a side-view hole. */
export function sides(width: number, height: number): Terrain[] {
  return [
    { material: "rubber", points: [[-8, 0], [0, 0], [0, height], [-8, height]] },
    { material: "rubber", points: [[width, 0], [width + 8, 0], [width + 8, height], [width, height]] },
  ];
}

/**
 * A drop-in pocket: a landing platform with a walled well in its top, the cup
 * at the bottom. This is the skee-ball ending — the thing that makes a
 * side-view hole about the *arc* rather than the roll.
 *
 * The lips on either side of the mouth have vertical outer faces, so a ball
 * travelling along the ground into the pocket hits that face and is rejected;
 * only a ball descending steeply enough to clear the lip's peak drops through
 * the mouth and into the well. Tune `lip` up to reject faster rollers, `mouth`
 * down to demand a tighter arc.
 *
 * Returns the terrain to spread into `terrain: [...]` and the `cup` coordinate
 * (authored at rest height on the well floor). Everything is arithmetic on the
 * arguments, so it stays replay-exact.
 */
export function pocket(
  cx: number,
  groundY: number,
  baseline: number,
  opts: { mouth?: number; lip?: number; depth?: number; half?: number; material?: MaterialId } = {},
): { terrain: Terrain[]; cup: Pt } {
  const mouth = opts.mouth ?? 40;
  const lip = opts.lip ?? 15;
  const depth = opts.depth ?? 20;
  const half = opts.half ?? mouth / 2 + 22;
  const material = opts.material ?? "green";

  const m = mouth / 2;
  const wall = 6; // inner-wall run, so the well floor is narrower than the mouth
  const floorY = groundY + depth;
  const peakY = groundY - lip;

  const top: Pt[] = [
    [cx - half, groundY],
    [cx - m - 3, groundY],
    [cx - m - 3, peakY], // vertical outer face of the left lip — the rejector
    [cx - m + 3, peakY], // narrow flat cap on the lip
    [cx - m + 3 + wall, floorY],
    [cx + m - 3 - wall, floorY],
    [cx + m - 3, peakY],
    [cx + m + 3, peakY],
    [cx + m + 3, groundY], // vertical outer face of the right lip
    [cx + half, groundY],
  ];

  return {
    terrain: [{ material, points: [...top, [cx + half, baseline], [cx - half, baseline]] }],
    cup: [cx, floorY - BALL_RADIUS],
  };
}

/** A closed smooth loop: mounds, islands, ponds, sand hollows. */
export function blob(controls: readonly Pt[], spacing: number = SPACING): Pt[] {
  return smooth(controls, spacing, true);
}

/**
 * Where a ball rests on a ridge at this x — its centre sits one radius above
 * the surface. Cups are authored in exactly those coordinates (see `draw.ts`
 * `mouthY`), so this is how a cup gets placed on a curve without hand-solving
 * the spline. Same arithmetic as the terrain itself, so the answer is stable.
 *
 * Returns undefined if x is off the ends of the profile.
 */
export function restYOn(surface: readonly Pt[], x: number): number | undefined {
  for (let i = 0; i < surface.length - 1; i++) {
    const a = surface[i];
    const b = surface[i + 1];
    if (x < a[0] || x > b[0]) continue;
    const span = b[0] - a[0];
    const y = span === 0 ? a[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / span;
    return y - BALL_RADIUS;
  }
  return undefined;
}

/** `restYOn` against a profile's controls, sampled the same way `ridge` does. */
export function restY(top: readonly Pt[], x: number, spacing: number = SPACING): number {
  const y = restYOn(smooth(top, spacing), x);
  if (y === undefined) throw new Error(`x=${x} is off the ends of this profile`);
  return y;
}
