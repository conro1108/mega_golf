/**
 * The top-down course: banks and routing.
 *
 * Gravity is off and the floor holds the ball, so there is no arc to read —
 * skill is angles, walls, and how much speed survives a surface. Same ball,
 * same slingshot gesture, same scoring as the side-view course; only what you
 * read changes. Nothing in here ever switches perspective mid-hole.
 *
 * Physics-wise a top-down hole is just `gravity: [0, 0]` plus a `floor`
 * material — see DESIGN.md "Two perspectives" and `sim.ts`.
 */

import type { Hole } from "../engine/world";
import { blob, thickCurve } from "./shape";

/** The four rubber walls every top-down room is boxed in by. */
function room(width: number, height: number): Hole["terrain"] {
  return [
    { material: "rubber", points: [[0, 0], [width, 0], [width, 8], [0, 8]] },
    { material: "rubber", points: [[0, height - 8], [width, height - 8], [width, height], [0, height]] },
    { material: "rubber", points: [[0, 0], [8, 0], [8, height], [0, height]] },
    { material: "rubber", points: [[width - 8, 0], [width, 0], [width, height], [width - 8, height]] },
  ];
}

export const TOP_DOWN_COURSE: Hole[] = [
  {
    name: "Straightaway",
    idea: "Top-down basics: no gravity, the floor slows you, and the cup is a straight line away.",
    par: 2,
    width: 480,
    height: 270,
    gravity: [0, 0],
    floor: "green",
    // ~280 units apart: a max top-down shot carries ~303, so an ace is
    // possible but only from a near-perfect strike.
    start: [60, 135],
    cup: [340, 135],
    terrain: [...room(480, 270)],
  },
  {
    name: "Dogleg",
    idea: "The direct line is walled off, so read the bank.",
    par: 3,
    width: 480,
    height: 270,
    gravity: [0, 0],
    floor: "green",
    start: [60, 220],
    cup: [420, 60],
    terrain: [
      ...room(480, 270),
      // A bowed barrier, not a post: the face you bank off is a different
      // angle depending on where you hit it, which is the whole lesson.
      { material: "rubber", points: thickCurve([[228, 8], [214, 70], [222, 130], [244, 176]], 8) },
    ],
  },
  {
    name: "Bumper Alley",
    idea: "A corridor of round bumpers — there is no clean line, so pick which one you're bouncing off.",
    par: 3,
    width: 560,
    height: 300,
    gravity: [0, 0],
    floor: "green",
    start: [50, 150],
    cup: [500, 150],
    terrain: [
      ...room(560, 300),
      { material: "rubber", points: blob([[210, 60], [246, 78], [246, 118], [210, 136], [174, 118], [174, 78]]) },
      { material: "rubber", points: blob([[210, 168], [246, 186], [246, 226], [210, 244], [174, 226], [174, 186]]) },
      { material: "rubber", points: blob([[350, 114], [386, 132], [386, 172], [350, 190], [314, 172], [314, 132]]) },
    ],
  },
  {
    name: "Frozen Vault",
    idea: "Ice everywhere except right around the cup — bank a fast line in, and the ring of sand is the only thing that stops you.",
    par: 3,
    width: 480,
    height: 300,
    gravity: [0, 0],
    floor: "ice",
    start: [50, 250],
    cup: [430, 50],
    terrain: [
      ...room(480, 300),
      // The vault's inner wall sweeps rather than leaning: on ice, where you
      // meet it decides everything, so the angle should change along its face.
      { material: "rubber", points: thickCurve([[204, 40], [232, 120], [262, 190], [288, 260]], 7) },
    ],
    zones: [{ points: blob([[430, 14], [466, 50], [430, 86], [394, 50]]), floor: "sand" }],
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
      ...room(480, 270),
      { material: "rubber", points: [[232, 8], [248, 8], [248, 170], [232, 170]] },
    ],
    // A kidney-shaped sand trap in the middle of the room instead of a box:
    // the safe gap around it is a curve you have to read, not a corner.
    zones: [{ points: blob([[150, 180], [250, 168], [330, 190], [320, 250], [200, 258], [148, 226]]), floor: "sand" }],
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
      ...room(500, 320),
      { material: "rubber", points: [[230, 150], [270, 150], [270, 190], [230, 190]] },
    ],
    zones: [
      { points: [[40, 40], [460, 40], [460, 140], [40, 140]], floor: "ice" },
      { points: [[40, 180], [460, 180], [460, 280], [40, 280]], floor: "sand" },
    ],
  },
  {
    name: "The Rotary",
    idea: "A round island dead in the middle: every route is a curve around it, and the curve you pick decides your angle in.",
    par: 4,
    width: 520,
    height: 420,
    gravity: [0, 0],
    floor: "green",
    start: [60, 360],
    cup: [460, 60],
    terrain: [
      ...room(520, 420),
      {
        material: "rubber",
        points: blob([[260, 130], [330, 160], [360, 210], [330, 260], [260, 290], [190, 260], [160, 210], [190, 160]]),
      },
      // Two stubs off the walls, so the wide way round isn't free either.
      { material: "rubber", points: [[8, 190], [90, 190], [90, 206], [8, 206]] },
      { material: "rubber", points: [[430, 214], [512, 214], [512, 230], [430, 230]] },
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
      ...room(420, 420),
      { material: "rubber", points: [[260, 200], [276, 200], [276, 412], [260, 412]] },
      { material: "rubber", points: [[260, 200], [370, 200], [370, 216], [260, 216]] },
    ],
  },
  {
    name: "Backboard",
    idea: "A concave backboard wraps the cup: fire hard past the pond and the curve brings you back in.",
    par: 3,
    width: 480,
    height: 320,
    gravity: [0, 0],
    floor: "green",
    // Tee to cup is ~268 against a ~303 max carry: the ace is real but it has
    // to be nearly full power, which is exactly what makes the pond scary.
    start: [90, 220],
    cup: [330, 100],
    terrain: [
      ...room(480, 320),
      // The backboard: a concave arc wrapped behind the cup, mouth toward the
      // tee. A hot approach that misses the cup hits the curve and is returned
      // through the cup region, slower — the geometry forgives the angle
      // while the power stays on the player.
      { material: "rubber", points: thickCurve([[292, 52], [336, 40], [378, 62], [394, 106], [376, 146]], 7) },
    ],
    // A pond just under the direct line: the brave shot skims its top edge,
    // and the short miss — the tempting under-hit — gets wet. The safe route
    // swings below it and stages in the open floor right of the pond.
    hazards: [{ points: blob([[152, 196], [232, 184], [262, 232], [216, 276], [148, 260]]) }],
  },
  {
    name: "The Grand Maze",
    idea: "The finale: a serpentine of three corridors, each opening at the far end from the last, with sub-cups banking the two descents.",
    par: 9,
    /**
     * Sized to how far the ball actually goes. A max top-down shot on green
     * travels ~303 units, so this room's ~2300-unit route is about nine good
     * strikes. An earlier draft was 1400x760 — visually mega, but fifteen-plus
     * shots of pure travel, and no search could finish it inside par.
     */
    width: 900,
    height: 560,
    gravity: [0, 0],
    floor: "green",
    start: [60, 100],
    cup: [820, 490],
    terrain: [
      ...room(900, 560),
      // The route is right, down, left, down, right. The dividers bow rather
      // than run straight — where along one you make contact changes the
      // angle you leave with.
      { material: "rubber", points: thickCurve([[8, 212], [260, 230], [500, 200], [700, 218]], 8) },
      { material: "rubber", points: thickCurve([[200, 404], [430, 386], [660, 414], [892, 396]], 8) },
      // One stub in the bottom corridor so the last run isn't a free slide.
      { material: "rubber", points: [[470, 492], [486, 492], [486, 552], [470, 552]] },
    ],
    zones: [
      // A sand collar so a hot approach can actually stop in the cup.
      { points: blob([[852, 490], [820, 456], [788, 490], [820, 524]]), floor: "sand" },
      // Ice across one stretch of the top corridor, not the whole floor: on a
      // hole this size an all-ice floor means shots that roll for ten seconds.
      { points: [[300, 30], [600, 30], [600, 195], [300, 195]], floor: "ice" },
    ],
    checkpoints: [
      // Through the right-hand gap into the middle corridor.
      { x: 800, y: 300, radius: 60 },
      // Through the left-hand gap into the bottom corridor.
      { x: 110, y: 470, radius: 60 },
    ],
  },
];
