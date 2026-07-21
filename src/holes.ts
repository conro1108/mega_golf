/**
 * The two courses.
 *
 * Perspective is a property of a *course*, not of a hole: you pick side-view
 * or top-down on the title screen and everything in that round is that one
 * game. (An earlier build alternated the two within a single round, and
 * switching lens mid-course read as confusing rather than as variety.)
 *
 * Each course is nine holes plus its own mega finale, in its own perspective.
 */

import { SIDE_COURSE } from "./holes/side";
import { TOP_DOWN_COURSE } from "./holes/top-down";
import type { Hole } from "./engine/world";

export interface Course {
  id: "side" | "top";
  /** Shown on the title screen. */
  name: string;
  /** One line under the name, explaining what the perspective asks of you. */
  blurb: string;
  holes: Hole[];
}

export const COURSES: Course[] = [
  {
    id: "side",
    name: "SIDE VIEW",
    blurb: "launch it — arcs, gaps, drop-in pockets",
    holes: SIDE_COURSE,
  },
  {
    id: "top",
    name: "TOP DOWN",
    blurb: "bank it — angles, walls, no gravity",
    holes: TOP_DOWN_COURSE,
  },
];

/** Every hole in the game, both courses. Used by determinism/content tests. */
export const ALL_HOLES: Hole[] = COURSES.flatMap((c) => c.holes);
