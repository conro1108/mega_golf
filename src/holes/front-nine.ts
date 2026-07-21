/**
 * Front nine: teaches one idea per hole, easy to hard. Side-view opens the
 * course (it reads at a glance); top-down is introduced at hole 4 and
 * reappears at 6 and 8 once the player has the side-view vocabulary down.
 *
 * Ground here is mostly authored as a *profile* — a handful of control points
 * run through `ridge`, which curves between them (see `shape.ts`). Tees and
 * cups sit on deliberately flat shelves in those profiles, so a resting ball
 * has somewhere level to sit, and their exact heights come from `restY` rather
 * than from hand-solving the curve.
 */

import type { Hole } from "../engine/world";
import { ridge, patch, smooth, blob, thickCurve, restY, type Pt } from "./shape";

const GROUND: Hole["terrain"][number]["material"] = "green";

/** Left and right bumpers, the standing walls of a side-view hole. */
function sides(width: number, height: number): Hole["terrain"] {
  return [
    { material: "rubber", points: [[-8, 0], [0, 0], [0, height], [-8, height]] },
    { material: "rubber", points: [[width, 0], [width + 8, 0], [width + 8, height], [width, height]] },
  ];
}

// ---------------------------------------------------------------- hole 1

const WARM_UP: Pt[] = [
  [0, 214],
  [70, 214],
  [150, 194],
  [230, 208],
  [300, 186],
  [370, 204],
  [420, 213],
  [480, 213],
];

// ---------------------------------------------------------------- hole 2

const BEACH: Pt[] = [
  [0, 212],
  [90, 212],
  [180, 202],
  [250, 224],
  [320, 238],
  [390, 224],
  [460, 204],
  [540, 210],
  [640, 210],
];
const BEACH_SURFACE = smooth(BEACH);

// ---------------------------------------------------------------- hole 7

const HILLS: Pt[] = [
  [0, 214],
  [80, 214],
  [160, 152],
  [240, 198],
  [310, 142],
  [390, 202],
  [470, 124],
  [560, 196],
  [640, 156],
  [730, 206],
  [810, 194],
  [900, 194],
];

// ---------------------------------------------------------------- hole 9

const FINALE_RUN: Pt[] = [
  [960, 150],
  [1050, 138],
  [1130, 162],
  [1210, 132],
  [1290, 152],
  [1340, 158],
  [1400, 158],
];

export const FRONT_NINE: Hole[] = [
  {
    name: "Warm Up",
    idea: "Baseline feel: how far does full power go over gentle ground?",
    par: 2,
    width: 480,
    height: 270,
    start: [40, restY(WARM_UP, 40)],
    cup: [430, restY(WARM_UP, 430)],
    terrain: [ridge(GROUND, WARM_UP, 270), ...sides(480, 270)],
  },
  {
    name: "The Beach",
    idea: "Sand punishes the short route; the high line over it is greedy.",
    par: 3,
    width: 640,
    height: 270,
    start: [40, restY(BEACH, 40)],
    cup: [590, restY(BEACH, 590)],
    terrain: [
      // The bunker is a hollow in the fairway rather than a pit cut into it:
      // a curved bowl is ramped everywhere by construction, and a sheer-walled
      // bunker with sand's real friction is a ball you never get out of.
      ridge(GROUND, BEACH, 270),
      patch("sand", BEACH_SURFACE, 230, 410, 270),
      ...sides(640, 270),
    ],
  },
  {
    name: "Cold Open",
    idea: "Ice removes the brake — commit to the bank or overshoot forever.",
    par: 4,
    width: 960,
    height: 270,
    start: [40, 190],
    cup: [880, 148],
    terrain: [
      // Deliberately hard-edged: this hole is about a flat sheet of ice and
      // the step up at the end of it, and a rolling surface would muddle both.
      { material: GROUND, points: [[0, 201], [300, 201], [300, 270], [0, 270]] },
      { material: "ice", points: [[360, 201], [700, 201], [700, 270], [360, 270]] },
      { material: GROUND, points: [[700, 201], [780, 151], [960, 151], [960, 270], [700, 270]] },
      ...sides(960, 270),
    ],
  },
  {
    name: "Dogleg",
    idea: "First top-down hole: the direct line is walled off, so read the bank.",
    par: 3,
    width: 480,
    height: 270,
    gravity: [0, 0],
    floor: "green",
    start: [60, 220],
    cup: [420, 60],
    terrain: [
      { material: "rubber", points: [[0, 0], [480, 0], [480, 8], [0, 8]] },
      { material: "rubber", points: [[0, 262], [480, 262], [480, 270], [0, 270]] },
      { material: "rubber", points: [[0, 0], [8, 0], [8, 270], [0, 270]] },
      { material: "rubber", points: [[472, 0], [480, 0], [480, 270], [472, 270]] },
      // A bowed barrier, not a post: the face you bank off is a different
      // angle depending on where you hit it, which is the whole lesson.
      {
        material: "rubber",
        points: thickCurve([[228, 8], [214, 70], [222, 130], [244, 176]], 8),
      },
    ],
  },
  {
    name: "Launch Pad",
    idea: "Rubber launches you over the gap — undershoot and it's a pit, overshoot and it's the far edge.",
    par: 3,
    width: 560,
    height: 270,
    start: [40, 200],
    cup: [470, 187],
    terrain: [
      { material: GROUND, points: [[0, 211], [180, 211], [180, 270], [0, 270]] },
      { material: "rubber", points: [[180, 211], [230, 150], [248, 150], [248, 270], [180, 270]] },
      { material: GROUND, points: [[340, 190], [520, 190], [520, 270], [340, 270]] },
      ...sides(560, 270),
    ],
  },
  {
    name: "Sand Court",
    idea: "The only gap through the divider is sanded — misjudge the power and you stall in the middle or slam the far wall.",
    par: 4,
    width: 480,
    height: 270,
    gravity: [0, 0],
    floor: "green",
    start: [50, 50],
    cup: [430, 220],
    terrain: [
      { material: "rubber", points: [[0, 0], [480, 0], [480, 8], [0, 8]] },
      { material: "rubber", points: [[0, 262], [480, 262], [480, 270], [0, 270]] },
      { material: "rubber", points: [[0, 0], [8, 0], [8, 270], [0, 270]] },
      { material: "rubber", points: [[472, 0], [480, 0], [480, 270], [472, 270]] },
      { material: "rubber", points: [[232, 8], [248, 8], [248, 170], [232, 170]] },
    ],
    // A kidney-shaped sand trap in the middle of the room instead of a box:
    // the safe gap around it is a curve you have to read, not a corner.
    zones: [{ points: blob([[150, 180], [250, 168], [330, 190], [320, 250], [200, 258], [148, 226]]), floor: "sand" }],
  },
  {
    name: "Rolling Hills",
    idea: "Momentum carries over hills you can't fully see from the tee — read the second hill before you commit to the first.",
    par: 4,
    width: 900,
    height: 270,
    start: [40, restY(HILLS, 40)],
    cup: [860, restY(HILLS, 860)],
    terrain: [ridge(GROUND, HILLS, 270), ...sides(900, 270)],
  },
  {
    name: "Frozen Vault",
    idea: "Ice everywhere except right around the cup — bank a fast line in, then a ring of sand around the hole is the only way to actually stop enough to sink it.",
    par: 3,
    width: 480,
    height: 300,
    gravity: [0, 0],
    floor: "ice",
    start: [50, 250],
    cup: [430, 50],
    terrain: [
      { material: "rubber", points: [[0, 0], [480, 0], [480, 8], [0, 8]] },
      { material: "rubber", points: [[0, 292], [480, 292], [480, 300], [0, 300]] },
      { material: "rubber", points: [[0, 0], [8, 0], [8, 300], [0, 300]] },
      { material: "rubber", points: [[472, 0], [480, 0], [480, 300], [472, 300]] },
      // The vault's inner wall sweeps rather than leaning: on ice, where you
      // meet it decides everything, so the angle should change along its face.
      { material: "rubber", points: thickCurve([[204, 40], [232, 120], [262, 190], [288, 260]], 7) },
    ],
    zones: [{ points: blob([[430, 14], [466, 50], [430, 86], [394, 50]]), floor: "sand" }],
  },
  {
    name: "Front Nine Finale",
    idea: "Every material from the front nine in one hole — plan the whole shot, not just the next bounce.",
    par: 5,
    width: 1400,
    height: 270,
    start: [40, 200],
    cup: [1340, restY(FINALE_RUN, 1340)],
    terrain: [
      { material: GROUND, points: [[0, 211], [200, 211], [200, 270], [0, 270]] },
      { material: "sand", points: [[200, 211], [380, 211], [380, 270], [200, 270]] },
      { material: "rubber", points: [[380, 211], [430, 160], [448, 160], [448, 270], [380, 270]] },
      { material: "ice", points: [[540, 190], [900, 190], [960, 150], [960, 270], [540, 270]] },
      // The run-in rolls: after three flat surfaces, the last stretch to the
      // cup is the one that asks you to read ground again.
      ridge(GROUND, FINALE_RUN, 270),
      ...sides(1400, 270),
    ],
  },
];
