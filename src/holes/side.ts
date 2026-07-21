/**
 * The side-view course: skee-ball.
 *
 * Every hole is a tee pad, a gap of open air, and a landing. The ball spends
 * its life in an *arc*, not a roll, and holes end in a drop-in `pocket` whose
 * lip rejects a ball arriving along the ground — the shot has to come down out
 * of the air. Holes are sized to one or two arcs (a max launch carries ~420
 * under the light side-view gravity), and undershooting drops the ball into
 * the gap for a reset, the way a skee-ball ramp hands it back.
 *
 * Perspective is a property of the *course* now, not of a hole: there is no
 * top-down anything in here. See `top-down.ts` for the other course.
 */

import type { Hole } from "../engine/world";
import { blob, pocket, platform, sides } from "./shape";

const WARM = pocket(360, 210, 270, { mouth: 52, lip: 12, depth: 18 });
const BEACH = pocket(470, 210, 270, { mouth: 48, lip: 14 });
const LAUNCH = pocket(460, 210, 270, { mouth: 48, lip: 13 });
const COLD = pocket(540, 210, 270, {});
const NEEDLE = pocket(500, 210, 270, { mouth: 50, lip: 13 });
const STONES = pocket(610, 210, 270, { mouth: 50, lip: 12 });
const WATER = pocket(580, 210, 270, { mouth: 48, lip: 14 });
const DIVE = pocket(220, 650, 700, { mouth: 46, lip: 14, depth: 22, half: 58, material: "sand" });

/** The finale's two banked landings and its final pocket. */
const MEGA_CHECK_A = pocket(700, 260, 420, { mouth: 46, lip: 12, depth: 18 });
const MEGA_CHECK_B = pocket(1250, 220, 420, { mouth: 46, lip: 12, depth: 18 });
const MEGA_END = pocket(1580, 240, 420, { mouth: 44, lip: 15, depth: 22 });

export const SIDE_COURSE: Hole[] = [
  {
    name: "Warm Up",
    idea: "Your first launch: arc it off the tee and drop it in the pocket.",
    par: 2,
    width: 480,
    height: 270,
    start: [55, 207],
    cup: WARM.cup,
    terrain: [platform(0, 120, 210, 270), ...WARM.terrain, ...sides(480, 270)],
  },
  {
    name: "The Beach",
    idea: "Land short and you plug in the sand; carry it clean and the pocket's right there.",
    par: 3,
    width: 560,
    height: 270,
    start: [55, 207],
    cup: BEACH.cup,
    terrain: [
      platform(0, 120, 210, 270),
      // A sunken bunker sitting in the gap: the safe lay-up lands in it, the
      // greedy line carries it into the pocket in one.
      platform(170, 330, 228, 270, "sand"),
      ...BEACH.terrain,
      ...sides(560, 270),
    ],
  },
  {
    name: "Launch Pad",
    idea: "Drop onto the rubber and let it fling you across the gap — or carry the whole thing if you dare.",
    par: 3,
    width: 560,
    height: 270,
    start: [60, 207],
    cup: LAUNCH.cup,
    terrain: [
      platform(0, 150, 210, 270),
      // A trampoline block sunk into the gap: a shot dropped onto it pings up
      // and over toward the pocket.
      platform(210, 262, 224, 270, "rubber"),
      ...LAUNCH.terrain,
      ...sides(560, 270),
    ],
  },
  {
    name: "Cold Open",
    idea: "The only footing is an ice shelf you can't stop on — land soft, or skid off the far edge.",
    par: 4,
    width: 620,
    height: 270,
    start: [60, 207],
    cup: COLD.cup,
    terrain: [
      platform(0, 130, 210, 270),
      platform(210, 430, 210, 270, "ice"),
      ...COLD.terrain,
      ...sides(620, 270),
    ],
  },
  {
    name: "Needle's Eye",
    idea: "A wall with one window in it stands between you and the pocket — put the arc through the gap.",
    par: 3,
    width: 640,
    height: 270,
    start: [60, 207],
    cup: NEEDLE.cup,
    terrain: [
      platform(0, 140, 210, 270),
      // A full-height wall split by a 40-unit window: there is no route along
      // the ground and no route over the top, so the launch has to thread it.
      { material: "rubber", points: [[298, 0], [318, 0], [318, 150], [298, 150]] },
      { material: "rubber", points: [[298, 190], [318, 190], [318, 270], [298, 270]] },
      ...NEEDLE.terrain,
      ...sides(640, 270),
    ],
  },
  {
    name: "Stepping Stones",
    idea: "Three landings and two gaps — read the whole chain of hops before you launch the first.",
    par: 4,
    width: 720,
    height: 270,
    start: [50, 211],
    cup: STONES.cup,
    terrain: [
      platform(0, 110, 214, 270),
      platform(190, 280, 188, 270),
      platform(360, 450, 214, 270),
      ...STONES.terrain,
      ...sides(720, 270),
    ],
  },
  {
    name: "Water Hazard",
    idea: "Two carries over open water, with one small island to stand on in between.",
    par: 4,
    width: 700,
    height: 270,
    start: [60, 207],
    cup: WATER.cup,
    terrain: [
      platform(0, 150, 210, 270),
      // The island is barely wider than a landing: overcook the first carry
      // and you're through it and wet on the far side.
      platform(300, 372, 210, 270),
      ...WATER.terrain,
      ...sides(700, 270),
    ],
    // Water fills the gaps rather than sitting in a basin — the whole floor of
    // this hole is the hazard, so a short arc is a stroke, not a lie.
    hazards: [
      { points: blob([[160, 244], [230, 236], [292, 244], [292, 292], [160, 292]]) },
      { points: blob([[380, 244], [460, 236], [524, 244], [524, 292], [380, 292]]) },
    ],
  },
  {
    name: "The Squeeze",
    idea: "The one hole that punishes lofting it: a ceiling too low to arc under, so drive it flat and let it roll in.",
    par: 4,
    width: 560,
    height: 270,
    start: [40, 207],
    cup: [520, 207],
    terrain: [
      // Deliberately the exception — continuous ground and a cup sitting on it.
      // Everything else here is a carry into a pocket, which is what makes a
      // hole that forbids the arc land as a change of pace.
      platform(0, 560, 210, 270),
      { material: "rubber", points: [[200, 140], [400, 140], [400, 160], [200, 160]] },
      platform(400, 470, 210, 270, "sand"),
      ...sides(560, 270),
    ],
  },
  {
    name: "High Dive",
    idea: "Steer a long fall: the bumpers on the way down are the only thing that moves you sideways into the pocket.",
    par: 4,
    width: 300,
    height: 700,
    start: [66, 30],
    cup: DIVE.cup,
    terrain: [
      { material: "rubber", points: [[0, 0], [8, 0], [8, 700], [0, 700]] },
      { material: "rubber", points: [[292, 0], [300, 0], [300, 700], [292, 700]] },
      { material: "rubber", points: [[8, 200], [40, 200], [40, 220], [8, 220]] },
      { material: "rubber", points: [[260, 350], [292, 350], [292, 370], [260, 370]] },
      { material: "rubber", points: [[8, 500], [40, 500], [40, 520], [8, 520]] },
      // Sand either side of the pocket: a miss lands soft rather than pinging
      // back up the shaft, so the next attempt is a short lob across.
      platform(8, 162, 650, 700, "sand"),
      platform(278, 292, 650, 700, "sand"),
      ...DIVE.terrain,
    ],
  },
  {
    name: "The Long Way Down",
    idea: "The finale: a dozen launches across every surface on the course, with two pockets partway that bank your progress.",
    par: 9,
    width: 1800,
    height: 420,
    start: [55, 297],
    cup: MEGA_END.cup,
    terrain: [
      platform(0, 120, 300, 420),
      platform(190, 300, 318, 420, "sand"),
      platform(380, 470, 280, 420),
      platform(540, 600, 300, 420, "rubber"),
      ...MEGA_CHECK_A.terrain,
      platform(850, 950, 250, 420),
      platform(1040, 1180, 236, 420, "ice"),
      ...MEGA_CHECK_B.terrain,
      platform(1400, 1470, 262, 420),
      ...MEGA_END.terrain,
      ...sides(1800, 420),
    ],
    // Sub-cups: landing in either banks your reset point, so a blown carry
    // late in the hole doesn't send you back to the tee.
    checkpoints: [
      { x: MEGA_CHECK_A.cup[0], y: MEGA_CHECK_A.cup[1], radius: 26 },
      { x: MEGA_CHECK_B.cup[0], y: MEGA_CHECK_B.cup[1], radius: 26 },
    ],
    // Water sits in two of the gaps, well below the landings on either side,
    // so it reads as "this one is a real miss" without ever overlapping ground
    // a ball is allowed to rest on.
    hazards: [
      { points: blob([[752, 372], [800, 364], [846, 372], [846, 412], [752, 412]]) },
      { points: blob([[1302, 372], [1350, 364], [1394, 372], [1394, 412], [1302, 412]]) },
    ],
  },
];
