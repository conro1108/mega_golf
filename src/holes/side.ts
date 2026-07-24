/**
 * The side-view course: skee-ball on rolling ground.
 *
 * Every hole is one continuous landscape — tee knolls, valleys, hollows,
 * plateaus — authored as Catmull-Rom ridges (`shape.ts`), with the drop-in
 * `pocket` set *into* the terrain: the ridges on either side end exactly at
 * the pocket's ground line, so the whole silhouette reads as one piece of
 * land. The ball still lives in an *arc* (a pocket's lip rejects a ball
 * arriving along the ground), but an undershoot now lands in trouble — a sand
 * hollow, a water basin, low ground — rather than falling out of the world.
 *
 * Holes are sized to one or two full arcs (a max launch carries ~416).
 * Perspective is a property of the *course*: there is no top-down anything in
 * here. See `top-down.ts` for the other course.
 */

import type { Hole, Terrain } from "../engine/world";
import { blob, patch, pocket, platform, restY, ridge, sides, smooth, type Pt } from "./shape";

/**
 * A hole's ground, assembled from ridge profiles and the pockets set between
 * them. Seams are exact by construction: each profile is required to start
 * and end at the ground line of whatever it abuts, and this checks it —
 * a seam that drifts by a unit is a lip the ball snags on mid-roll, months
 * later, on one specific shot.
 */
function fairway(
  baseline: number,
  ...parts: (readonly Pt[] | ReturnType<typeof pocket>)[]
): Terrain[] {
  const out: Terrain[] = [];
  let prev: Pt | null = null;
  for (const part of parts) {
    if (Array.isArray(part) === false) {
      const p = part as ReturnType<typeof pocket>;
      const first = p.terrain[0].points[0];
      if (prev && (first[0] !== prev[0] || first[1] !== prev[1])) {
        throw new Error(`fairway seam mismatch at pocket x=${first[0]}`);
      }
      out.push(...p.terrain);
      const pts = p.terrain[0].points;
      // A pocket's ground line resumes where its top profile ends (the last
      // point before the two baseline corners).
      prev = pts[pts.length - 3] as Pt;
    } else {
      const controls = part as readonly Pt[];
      if (prev && (controls[0][0] !== prev[0] || controls[0][1] !== prev[1])) {
        throw new Error(`fairway seam mismatch at ridge x=${controls[0][0]}`);
      }
      out.push(ridge("green", controls, baseline));
      prev = controls[controls.length - 1];
    }
  }
  return out;
}

export const SIDE_COURSE: Hole[] = [
  (() => {
    // Tee rise, a shallow dell, pocket on a plateau: the first arc, nothing else.
    const L: Pt[] = [[0, 210], [60, 204], [130, 212], [200, 226], [260, 222], [312, 196]];
    const P = pocket(360, 196, 270, { mouth: 52, lip: 11, depth: 18, half: 48 });
    const R: Pt[] = [[408, 196], [444, 202], [480, 208]];
    return {
      name: "Warm Up",
      idea: "Your first launch: arc it off the tee and drop it in the pocket.",
      par: 2,
      width: 480,
      height: 270,
      start: [70, restY(L, 70)],
      cup: P.cup,
      terrain: [...fairway(270, L, P, R), ...sides(480, 270)],
    } satisfies Hole;
  })(),

  (() => {
    // A sand basin sits exactly where a timid first shot lands. Carry it all
    // and the pocket is right there; lay up and you're blasting out of the beach.
    const L: Pt[] = [[0, 206], [70, 200], [150, 210], [230, 238], [300, 248], [360, 236], [424, 192]];
    const P = pocket(470, 192, 270, { mouth: 48, lip: 13, half: 46 });
    const R: Pt[] = [[516, 192], [540, 198], [560, 200]];
    const surf = smooth(L);
    return {
      name: "The Beach",
      idea: "Land short and you plug in the sand; carry it clean and the pocket's right there.",
      par: 3,
      width: 560,
      height: 270,
      start: [60, restY(L, 60)],
      cup: P.cup,
      // Patch baselines sit just under the deepest point of their span — a
      // lens of material under the surface, not a column to the world floor.
      // Purely how the cross-section draws; the probe only samples 1 deep.
      terrain: [...fairway(270, L, P, R), patch("sand", surf, 236, 386, 264), ...sides(560, 270)],
    } satisfies Hole;
  })(),

  (() => {
    // A rubber trampoline sunk in a hollow, and a pocket set 512 units off the
    // tee — past the 416 a max launch can carry (v^2/g), so no ballistic arc
    // reaches it. The greedy line is a *sling*: drop into the hollow at the one
    // speed-and-angle window and the trampoline flings you the rest of the way
    // in, one shot. Undershoot and you're stuck bouncing in the bowl; overshoot
    // and you fly the cup into the pond past it. The safe line ignores all that
    // — lob onto the shoulder short of the pocket, then pitch in: two calm hops.
    const L: Pt[] = [
      [0, 188], [86, 194], [162, 220], [242, 262], [312, 280],
      [382, 262], [452, 224], [512, 208],
    ];
    const P = pocket(558, 208, 320, { mouth: 46, lip: 13, half: 46 });
    const R: Pt[] = [[604, 208], [648, 236], [700, 236]];
    const surf = smooth(L);
    return {
      name: "The Sling",
      idea: "Drop the trampoline hollow's one window and it slings you the whole way in — or lay up over it and pitch across.",
      par: 3,
      width: 700,
      height: 320,
      start: [46, restY(L, 46)],
      cup: P.cup,
      terrain: [...fairway(320, L, P, R), patch("rubber", surf, 242, 382, 268), ...sides(700, 320)],
      // A pond just past the pocket: too much sling and you fly the cup, wet.
      hazards: [{ points: blob([[652, 250], [700, 250], [700, 320], [652, 320]]) }],
    } satisfies Hole;
  })(),

  (() => {
    // A long downhill ice shelf: land soft at the top and you might hold it,
    // anything else skids off the bottom into the sand. The greedy line carries
    // the entire shelf in one max launch.
    const L: Pt[] = [[0, 196], [70, 190], [130, 200], [210, 210], [300, 220], [400, 230], [455, 248], [514, 200]];
    const P = pocket(560, 200, 270, { mouth: 48, lip: 13, half: 46 });
    const R: Pt[] = [[606, 200], [620, 204]];
    const surf = smooth(L);
    return {
      name: "Cold Open",
      idea: "A downhill ice shelf you can't stop on — land soft at the top, or skid off into the sand.",
      par: 4,
      width: 620,
      height: 270,
      start: [56, restY(L, 56)],
      cup: P.cup,
      terrain: [
        ...fairway(270, L, P, R),
        patch("ice", surf, 140, 428, 258),
        patch("sand", surf, 432, 502, 264),
        ...sides(620, 270),
      ],
    } satisfies Hole;
  })(),

  (() => {
    // A wall with one window in it, standing on the fairway: no route along the
    // ground, no route over the top — the arc has to thread the gap.
    const L: Pt[] = [[0, 208], [80, 202], [160, 212], [240, 222], [330, 228], [400, 222], [474, 196]];
    const P = pocket(520, 196, 270, { mouth: 50, lip: 13, half: 46 });
    const R: Pt[] = [[566, 196], [610, 202], [640, 206]];
    return {
      name: "Needle's Eye",
      idea: "A wall with one window in it stands between you and the pocket — put the arc through the gap.",
      par: 3,
      width: 640,
      height: 270,
      start: [60, restY(L, 60)],
      cup: P.cup,
      terrain: [
        ...fairway(270, L, P, R),
        // Window between y 132 and 172: too high to clear, too low to roll under.
        { material: "rubber", points: [[322, 0], [338, 0], [338, 132], [322, 132]] },
        { material: "rubber", points: [[322, 172], [338, 172], [338, 270], [322, 270]] },
        ...sides(640, 270),
      ],
    } satisfies Hole;
  })(),

  (() => {
    // Three landings, two flooded dips. Each landing is a *dished* plateau —
    // two low rims with a shallow basin between them — not a dome. A dome's
    // only flat spot is its peak, which is an unstable equilibrium: a ball
    // that lands there rolls off whichever side it touched down on, so the
    // hole read as unwinnable rather than hard. The dish gives a landing
    // somewhere to actually settle while the flanks still shed a miss.
    const L: Pt[] = [
      [0, 214], [56, 204], [104, 212],
      [148, 238], [196, 256], [244, 238],
      [286, 210], [320, 218], [354, 210],
      [396, 238], [444, 256], [492, 238],
      [536, 210], [572, 202], [614, 196],
    ];
    const P = pocket(660, 196, 270, { mouth: 48, lip: 12, half: 46 });
    const R: Pt[] = [[706, 196], [720, 198]];
    return {
      name: "Stepping Stones",
      idea: "Three landings and two flooded gaps — read the whole chain of hops before you launch the first.",
      par: 4,
      width: 720,
      height: 270,
      start: [56, restY(L, 56)],
      cup: P.cup,
      terrain: [...fairway(270, L, P, R), ...sides(720, 270)],
      hazards: [
        { points: blob([[158, 246], [238, 246], [238, 270], [158, 270]]) },
        { points: blob([[406, 246], [486, 246], [486, 270], [406, 270]]) },
      ],
    } satisfies Hole;
  })(),

  (() => {
    // Two real carries over water, one island to stand on in between. The
    // island is a dished plateau (see Stepping Stones) so it can hold a ball
    // that finds it; its flanks are steep enough to shed one that doesn't.
    const L: Pt[] = [
      [0, 204], [70, 198], [140, 208], [186, 234], [230, 258], [284, 262], [326, 246],
      [354, 214], [392, 222], [430, 214],
      [458, 246], [496, 256], [524, 236], [548, 212], [564, 196],
    ];
    const P = pocket(610, 196, 270, { mouth: 48, lip: 13, half: 46 });
    const R: Pt[] = [[656, 196], [700, 200]];
    return {
      name: "Water Hazard",
      idea: "Two carries over open water, with one small island to stand on in between.",
      par: 4,
      width: 700,
      height: 270,
      start: [60, restY(L, 60)],
      cup: P.cup,
      terrain: [...fairway(270, L, P, R), ...sides(700, 270)],
      hazards: [
        { points: blob([[196, 248], [330, 248], [330, 270], [196, 270]]) },
        { points: blob([[462, 248], [526, 248], [526, 270], [462, 270]]) },
      ],
    } satisfies Hole;
  })(),

  (() => {
    // The one hole that forbids the launch: a ceiling too low to arc under, a
    // cup sunk straight into the fairway, and a sand backstop past it so an
    // overdriven ball dies close instead of rattling around.
    const T: Pt[] = [
      [0, 212], [70, 208], [140, 214], [220, 210], [300, 216], [380, 212],
      [460, 216], [520, 212], [560, 214],
    ];
    const surf = smooth(T);
    return {
      name: "The Squeeze",
      idea: "The one hole that punishes lofting it: a ceiling too low to arc under, so drive it flat and let it roll in.",
      par: 4,
      width: 560,
      height: 270,
      start: [40, restY(T, 40)],
      cup: [500, restY(T, 500)],
      terrain: [
        ridge("green", T, 270),
        patch("sand", surf, 516, 548, 232),
        { material: "rubber", points: [[160, 130], [430, 130], [430, 150], [160, 150]] },
        ...sides(560, 270),
      ],
    } satisfies Hole;
  })(),

  (() => {
    // A diving board, a long fall, and three bumpers that are the only thing
    // that moves you sideways on the way down to the pocket in the sand.
    const L: Pt[] = [[8, 642], [80, 650], [140, 656], [176, 650]];
    const P = pocket(220, 650, 700, { mouth: 46, lip: 13, depth: 22, half: 44, material: "sand" });
    const R: Pt[] = [[264, 650], [292, 644]];
    const ground = fairway(700, L, P, R);
    // The whole floor is sand, not green: a missed dive lands soft and the next
    // attempt is a short lob, not a ping back up the shaft.
    for (const t of ground) (t as { material: string }).material = "sand";
    return {
      name: "High Dive",
      idea: "Steer a long fall: the bumpers on the way down are the only thing that moves you sideways into the pocket.",
      par: 4,
      width: 300,
      height: 700,
      start: [50, 37],
      cup: P.cup,
      terrain: [
        // The diving board itself.
        platform(8, 100, 40, 52, "green"),
        { material: "rubber", points: [[0, 0], [8, 0], [8, 700], [0, 700]] },
        { material: "rubber", points: [[292, 0], [300, 0], [300, 700], [292, 700]] },
        { material: "rubber", points: [[8, 200], [48, 200], [48, 220], [8, 220]] },
        { material: "rubber", points: [[252, 350], [292, 350], [292, 370], [252, 370]] },
        { material: "rubber", points: [[8, 500], [48, 500], [48, 520], [8, 520]] },
        ...ground,
      ],
    } satisfies Hole;
  })(),

  (() => {
    // The finale: one long piece of country — sand dell, trampoline hollow,
    // two water basins, an ice slope — with two pockets partway that bank
    // your progress and a final pocket up on the last rise.
    const R1: Pt[] = [
      [0, 306], [70, 298], [120, 302], [180, 326], [230, 338], [290, 326],
      [350, 282], [400, 270], [450, 280], [520, 308], [570, 312], [620, 296], [654, 260],
    ];
    const A = pocket(700, 260, 420, { mouth: 46, lip: 12, depth: 18, half: 46 });
    const R2: Pt[] = [
      [746, 260], [790, 288], [830, 348], [880, 352], [920, 292], [960, 282],
      [1010, 288], [1090, 296], [1170, 306], [1204, 284],
    ];
    const B = pocket(1250, 284, 420, { mouth: 46, lip: 12, depth: 18, half: 46 });
    const R3: Pt[] = [
      [1296, 284], [1330, 312], [1370, 356], [1420, 360], [1470, 300], [1520, 282], [1574, 254],
    ];
    const E = pocket(1620, 254, 420, { mouth: 44, lip: 14, depth: 22, half: 46 });
    const R4: Pt[] = [[1666, 254], [1720, 262], [1800, 274]];
    const surf1 = smooth(R1);
    const surf2 = smooth(R2);
    return {
      name: "The Long Way Down",
      idea: "The finale: a long run of launches across every surface on the course, with two pockets partway that bank your progress.",
      par: 9,
      width: 1800,
      height: 420,
      start: [64, restY(R1, 64)],
      cup: E.cup,
      terrain: [
        ...fairway(420, R1, A, R2, B, R3, E, R4),
        patch("sand", surf1, 160, 310, 354),
        patch("rubber", surf1, 480, 600, 328),
        patch("ice", surf2, 1000, 1180, 322),
        ...sides(1800, 420),
      ],
      checkpoints: [
        { x: A.cup[0], y: A.cup[1], radius: 26 },
        { x: B.cup[0], y: B.cup[1], radius: 26 },
      ],
      hazards: [
        { points: blob([[806, 336], [900, 336], [900, 368], [806, 368]]) },
        { points: blob([[1348, 344], [1440, 344], [1440, 376], [1348, 376]]) },
      ],
    } satisfies Hole;
  })(),
];
