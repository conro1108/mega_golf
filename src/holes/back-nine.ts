/**
 * Back nine: same materials and both perspectives, harder combinations —
 * longer holes, tighter windows, hazards stacked together. Hole 17
 * rehearses the mega hole's perspective-switch trick at a third of the
 * scale, so hole 18 lands as an escalation rather than a surprise.
 */

import type { Hole } from "../engine/world";
import { ridge, blob, thickCurve, restY, type Pt } from "./shape";

const GROUND: Hole["terrain"][number]["material"] = "green";

/**
 * Water Hazard's two banks.
 *
 * Shape decides play here more than anything else on the course. The near bank
 * is near-level so laying up short of the water actually holds; the far bank
 * climbs out of the pond to a crest and only then settles, so a carry that
 * clears the water stays cleared instead of trickling back down the slope it
 * just landed on. An earlier version of these curves tipped both banks toward
 * the pond, and the hole had exactly zero playable landing spots.
 */
const NEAR_BANK: Pt[] = [
  [0, 210],
  [80, 213],
  [160, 214],
  [240, 212],
  [285, 209],
  [300, 216],
];
const FAR_BANK: Pt[] = [
  [500, 216],
  [522, 203],
  [548, 199],
  [592, 207],
  [650, 210],
  [700, 211],
  [760, 211],
];

/**
 * High Dive's landing: a sand basin with two pockets and a rise between them.
 * The cup is in the far pocket, so a ball that simply falls doesn't feed into
 * it — a single dish centred under the tee made the hole score zero without
 * anyone taking a shot.
 */
const BASIN: Pt[] = [
  [8, 648],
  [66, 676],
  [130, 666],
  [186, 650],
  [244, 674],
  [292, 662],
];

export const BACK_NINE: Hole[] = [
  {
    name: "Needle's Eye",
    idea: "A narrow window between a post and an overhang is the only way through — thread it or bounce back.",
    par: 4,
    width: 700,
    height: 270,
    start: [40, 200],
    cup: [660, 208],
    terrain: [
      { material: GROUND, points: [[0, 211], [700, 211], [700, 270], [0, 270]] },
      { material: "rubber", points: [[340, 211], [366, 211], [366, 150], [340, 150]] },
      { material: "rubber", points: [[300, 90], [420, 90], [420, 104], [300, 104]] },
      { material: "rubber", points: [[-8, 0], [0, 0], [0, 270], [-8, 270]] },
      { material: "rubber", points: [[700, 0], [708, 0], [708, 270], [700, 270]] },
    ],
  },
  {
    name: "Water Hazard",
    idea: "Carry the pond in one committed swing, or lay up short of the bank for a cleaner look next try.",
    par: 4,
    width: 760,
    height: 270,
    start: [40, restY(NEAR_BANK, 40)],
    cup: [720, restY(FAR_BANK, 720)],
    terrain: [
      ridge(GROUND, NEAR_BANK, 270),
      ridge(GROUND, FAR_BANK, 270),
      { material: "rubber", points: [[-8, 0], [0, 0], [0, 270], [-8, 270]] },
      { material: "rubber", points: [[760, 0], [768, 0], [768, 270], [760, 270]] },
    ],
    // The pond is a pool between the two banks, not a rectangle: it holds its
    // own corners at the waterline (extra controls there) so the smoothing
    // can't bulge it out over ground a ball is allowed to rest on.
    hazards: [
      {
        points: blob([
          [304, 216],
          [340, 244],
          [400, 252],
          [460, 244],
          [496, 216],
          [496, 250],
          [480, 296],
          [320, 296],
          [304, 250],
        ]),
      },
    ],
  },
  {
    name: "Crosscut",
    idea: "Ice on one crossing, sand on the other, and a peg splitting the room — the fast line and the controlled line can't both be yours.",
    par: 4,
    width: 500,
    height: 320,
    gravity: [0, 0],
    floor: "green",
    start: [40, 40],
    cup: [460, 280],
    terrain: [
      { material: "rubber", points: [[0, 0], [500, 0], [500, 8], [0, 8]] },
      { material: "rubber", points: [[0, 312], [500, 312], [500, 320], [0, 320]] },
      { material: "rubber", points: [[0, 0], [8, 0], [8, 320], [0, 320]] },
      { material: "rubber", points: [[492, 0], [500, 0], [500, 320], [492, 320]] },
      { material: "rubber", points: [[230, 150], [270, 150], [270, 190], [230, 190]] },
    ],
    zones: [
      { points: [[40, 40], [460, 40], [460, 140], [40, 140]], floor: "ice" },
      { points: [[40, 180], [460, 180], [460, 280], [40, 280]], floor: "sand" },
    ],
  },
  {
    name: "The Maze",
    idea: "No physics trick here, just the layout — read the whole maze before you commit to a bank, because the walls don't forgive a wrong turn.",
    par: 6,
    width: 340,
    height: 340,
    gravity: [0, 0],
    floor: "green",
    start: [40, 40],
    cup: [300, 300],
    terrain: [
      { material: "rubber", points: [[0, 0], [340, 0], [340, 8], [0, 8]] },
      { material: "rubber", points: [[0, 332], [340, 332], [340, 340], [0, 340]] },
      { material: "rubber", points: [[0, 0], [8, 0], [8, 340], [0, 340]] },
      { material: "rubber", points: [[332, 0], [340, 0], [340, 340], [332, 340]] },
      { material: "rubber", points: [[8, 110], [230, 110], [230, 126], [8, 126]] },
      { material: "rubber", points: [[110, 210], [332, 210], [332, 226], [110, 226]] },
    ],
  },
  {
    name: "High Dive",
    idea: "A sheer vertical drop — trust the sand at the bottom to kill your fall speed, and stay off the bumpers or you'll ricochet wide.",
    par: 4,
    width: 300,
    height: 700,
    start: [66, 30],
    cup: [244, restY(BASIN, 244)],
    terrain: [
      { material: "rubber", points: [[0, 0], [8, 0], [8, 700], [0, 700]] },
      { material: "rubber", points: [[292, 0], [300, 0], [300, 700], [292, 700]] },
      { material: "rubber", points: [[8, 200], [40, 200], [40, 220], [8, 220]] },
      { material: "rubber", points: [[260, 350], [292, 350], [292, 370], [260, 370]] },
      { material: "rubber", points: [[8, 500], [40, 500], [40, 520], [8, 520]] },
      // A dished basin rather than a flat sand floor: miss the middle and the
      // slope feeds you back toward the cup instead of leaving you plugged.
      ridge("sand", BASIN, 700),
    ],
  },
  {
    name: "The Squeeze",
    idea: "A ceiling low enough to bonk a lofted shot back at you — stay flat through it, and flat means less speed to fight the sand just past it.",
    par: 4,
    width: 640,
    height: 270,
    start: [40, 200],
    cup: [600, 208],
    terrain: [
      { material: GROUND, points: [[0, 211], [640, 211], [640, 270], [0, 270]] },
      { material: "rubber", points: [[200, 140], [400, 140], [400, 160], [200, 160]] },
      { material: "sand", points: [[400, 211], [500, 211], [500, 270], [400, 270]] },
      { material: "rubber", points: [[-8, 0], [0, 0], [0, 270], [-8, 270]] },
      { material: "rubber", points: [[640, 0], [648, 0], [648, 270], [640, 270]] },
    ],
  },
  {
    name: "Spin Trap",
    idea: "The cup sits behind a corner with no straight line to it from anywhere in the room — plan two banks, not one.",
    par: 5,
    width: 420,
    height: 420,
    gravity: [0, 0],
    floor: "green",
    start: [50, 50],
    cup: [370, 370],
    terrain: [
      { material: "rubber", points: [[0, 0], [420, 0], [420, 8], [0, 8]] },
      { material: "rubber", points: [[0, 412], [420, 412], [420, 420], [0, 420]] },
      { material: "rubber", points: [[0, 0], [8, 0], [8, 420], [0, 420]] },
      { material: "rubber", points: [[412, 0], [420, 0], [420, 420], [412, 420]] },
      { material: "rubber", points: [[260, 200], [276, 200], [276, 412], [260, 412]] },
      { material: "rubber", points: [[260, 200], [370, 200], [370, 216], [260, 216]] },
    ],
  },
  {
    name: "Last Call",
    idea: "One last side-view drop, but this time it doesn't end there — the floor at the bottom turns the fall into a roll, the same trick the finale runs at full scale.",
    par: 5,
    width: 500,
    height: 500,
    start: [40, 30],
    cup: [440, 460],
    terrain: [
      { material: "rubber", points: [[0, 0], [8, 0], [8, 500], [0, 500]] },
      { material: "rubber", points: [[492, 0], [500, 0], [500, 500], [492, 500]] },
      { material: "rubber", points: [[8, 120], [60, 120], [60, 136], [8, 136]] },
      { material: "rubber", points: [[440, 220], [492, 220], [492, 236], [440, 236]] },
      { material: "rubber", points: [[8, 492], [492, 492], [492, 500], [8, 500]] },
      // Down on the floor, a curved rail across the room: the cup is past its
      // right-hand end, so the roll out of the drop has to be steered, not
      // just survived.
      { material: "rubber", points: thickCurve([[110, 392], [240, 428], [370, 398]], 8) },
    ],
    zones: [{ points: [[8, 300], [492, 300], [492, 492], [8, 492]], gravity: [0, 0], floor: "green" }],
    checkpoints: [{ x: 150, y: 320, radius: 45 }],
  },
];
