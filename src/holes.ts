/**
 * Toy holes for the side-view prototype. Each one names the single idea it
 * exists to test — per the design notes, a hole without a nameable idea is a
 * hole that gets cut.
 */

import type { Hole } from "./engine/world";

const GROUND: Hole["terrain"][number]["material"] = "green";

export const HOLES: Hole[] = [
  {
    name: "Warm Up",
    idea: "Baseline feel: how far does full power go on flat green?",
    par: 2,
    width: 480,
    height: 270,
    start: [40, 200],
    cup: [430, 208],
    terrain: [
      {
        material: GROUND,
        points: [
          [0, 211],
          [150, 211],
          [200, 170],
          [250, 170],
          [300, 211],
          [480, 211],
          [480, 270],
          [0, 270],
        ],
      },
      // Left wall, so a mishit doesn't just leave the world.
      { material: "rubber", points: [[-8, 0], [0, 0], [0, 270], [-8, 270]] },
    ],
  },
  {
    name: "The Beach",
    idea: "Sand punishes the short route; the high line over it is greedy.",
    par: 3,
    width: 640,
    height: 270,
    start: [40, 200],
    cup: [590, 208],
    terrain: [
      {
        material: GROUND,
        points: [
          [0, 211],
          [240, 211],
          [240, 230],
          [400, 230],
          [400, 211],
          [640, 211],
          [640, 270],
          [0, 270],
        ],
      },
      { material: "sand", points: [[240, 230], [400, 230], [400, 270], [240, 270]] },
      { material: "rubber", points: [[-8, 0], [0, 0], [0, 270], [-8, 270]] },
      { material: "rubber", points: [[640, 0], [648, 0], [648, 270], [640, 270]] },
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
      {
        material: GROUND,
        points: [
          [0, 201],
          [300, 201],
          [300, 270],
          [0, 270],
        ],
      },
      {
        material: "ice",
        points: [
          [360, 201],
          [700, 201],
          [700, 270],
          [360, 270],
        ],
      },
      {
        material: GROUND,
        points: [
          [700, 201],
          [780, 151],
          [960, 151],
          [960, 270],
          [700, 270],
        ],
      },
      { material: "rubber", points: [[-8, 0], [0, 0], [0, 270], [-8, 270]] },
      { material: "rubber", points: [[960, 0], [968, 0], [968, 270], [960, 270]] },
    ],
  },
  {
    name: "Dogleg",
    idea: "First top-down hole: the direct line is walled off, so read the bank.",
    par: 3,
    width: 480,
    height: 270,
    // Top-down: no gravity, and the floor is what slows the ball.
    gravity: [0, 0],
    floor: "green",
    start: [60, 220],
    cup: [420, 60],
    terrain: [
      // Outer walls.
      { material: "rubber", points: [[0, 0], [480, 0], [480, 8], [0, 8]] },
      { material: "rubber", points: [[0, 262], [480, 262], [480, 270], [0, 270]] },
      { material: "rubber", points: [[0, 0], [8, 0], [8, 270], [0, 270]] },
      { material: "rubber", points: [[472, 0], [480, 0], [480, 270], [472, 270]] },
      // The divider that makes the hole. Hangs from the top wall, so the
      // straight shot at the cup is blocked and the bank is the answer.
      { material: "rubber", points: [[220, 8], [236, 8], [236, 175], [220, 175]] },
      // NOTE: no sand patch here yet. Terrain polygons are colliders, so a
      // sand rectangle on a top-down floor would behave as a bouncy wall
      // rather than a slow patch. Floor *regions* (material by area, not by
      // edge) are a separate feature the engine doesn't have — see DESIGN.md.
    ],
  },
];
