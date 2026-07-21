/**
 * The mega hole: the finale every course builds to. A side-view fairway
 * gives way to a long vertical drop, and the drop hands off — via a
 * gravity/floor zone, no special-casing — into a wide top-down maze at the
 * bottom. Two checkpoints bank progress along the way so a bad maze attempt
 * doesn't cost the whole descent. Hole 17 rehearsed this trick in miniature;
 * this is the full-scale version DESIGN.md calls "the screenshot."
 */

import type { Hole } from "../engine/world";
import { ridge, patch, smooth, thickCurve, restY, type Pt } from "./shape";

/**
 * The opening fairway: rolling green that tips into an icy shoulder, and off
 * the end of that, nothing but the shaft. The roll matters here — it's the
 * last ordinary golf the hole contains.
 */
const APPROACH: Pt[] = [
  [0, 258],
  [44, 250],
  [88, 264],
  [126, 254],
  [160, 250],
];
const APPROACH_SURFACE = smooth(APPROACH);

export const MEGA_HOLE: Hole = {
  name: "The Long Way Down",
  idea: "The finale: a fairway becomes a shaft becomes a floor. Same ball, same gesture, and the game turns inside out under it.",
  par: 9,
  width: 1400,
  height: 760,
  start: [30, restY(APPROACH, 30)],
  cup: [1340, 697],
  terrain: [
    // Intro fairway: green, then ice right up to the shaft's mouth. The ice is
    // cut from the fairway's own vertices, so the two share a surface exactly.
    ridge("green", APPROACH, 320),
    patch("ice", APPROACH_SURFACE, 62, 160, 320),
    // The shaft: a narrow fall between the fairway and the maze floor far below.
    { material: "rubber", points: [[160, 250], [176, 250], [176, 560], [160, 560]] },
    { material: "rubber", points: [[304, 250], [320, 250], [320, 560], [304, 560]] },
    { material: "rubber", points: [[176, 350], [210, 350], [210, 364], [176, 364]] },
    { material: "rubber", points: [[270, 430], [304, 430], [304, 444], [270, 444]] },
    // The maze room's outer walls.
    { material: "rubber", points: [[0, 560], [8, 560], [8, 752], [0, 752]] },
    { material: "rubber", points: [[1392, 560], [1400, 560], [1400, 752], [1392, 752]] },
    { material: "rubber", points: [[0, 744], [1400, 744], [1400, 752], [0, 752]] },
    // The one baffle wall: go right, around its end, then down to the cup.
    // It bows across the room, so the angle you get off it depends on where
    // along it you arrive — the maze's only real shot-shaping decision.
    {
      material: "rubber",
      points: thickCurve([[176, 646], [400, 676], [660, 636], [900, 660]], 8),
    },
  ],
  zones: [
    // A sand collar around the cup, so a hot approach can actually stop.
    // Listed before the maze zone so its floor wins where the two overlap.
    {
      points: [
        [1370, 700],
        [1361, 679],
        [1340, 670],
        [1319, 679],
        [1310, 700],
        [1319, 721],
        [1340, 730],
        [1361, 721],
      ],
      gravity: [0, 0],
      floor: "sand",
    },
    // The handoff: below the shaft, gravity turns off and the floor takes over.
    { points: [[0, 560], [1400, 560], [1400, 752], [0, 752]], gravity: [0, 0], floor: "green" },
  ],
  checkpoints: [
    // The landing at the bottom of the shaft.
    { x: 240, y: 540, radius: 50 },
    // Round the baffle wall's end.
    { x: 900, y: 658, radius: 55 },
  ],
};
