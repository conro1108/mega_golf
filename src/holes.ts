/**
 * The course: 18 holes, front nine easier and back nine harder, ending in
 * the mega hole. Content lives split by section under `src/holes/` because
 * 18 hand-authored holes in one file stops being readable; this file is
 * just the ordering.
 */

import { FRONT_NINE } from "./holes/front-nine";
import { BACK_NINE } from "./holes/back-nine";
import { MEGA_HOLE } from "./holes/mega";
import type { Hole } from "./engine/world";

export const HOLES: Hole[] = [...FRONT_NINE, ...BACK_NINE, MEGA_HOLE];
