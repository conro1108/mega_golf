/**
 * Cross-platform determinism guard.
 *
 * sim.test.ts proves a replay is stable *within one process on one machine*.
 * That is the weaker half of the ghost-putt guarantee: the real requirement is
 * that a shot recorded on someone's phone lands on the same pixel when it
 * replays on someone else's laptop. Nothing you can assert in a single process
 * catches a divergence there.
 *
 * So the expected outcomes live in a checked-in fixture instead. Whatever
 * machine CI runs on has to reproduce numbers that were generated somewhere
 * else, byte for byte — which is the property that actually matters.
 *
 * Regenerate deliberately, never reflexively:
 *
 *     npm run golden:update
 *
 * A diff here means the physics changed. If that was intentional, commit the
 * regenerated fixture and understand that every previously recorded shot
 * (and every leaderboard score derived from one) is now invalid.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSim, simulateShot } from "./sim";
import type { Shot } from "./world";
import { ALL_HOLES as HOLES } from "../holes";

const FIXTURE = fileURLToPath(new URL("./golden.json", import.meta.url));

interface GoldenEntry {
  hole: string;
  angle: number;
  power: number;
  x: number;
  y: number;
  steps: number;
  state: string;
  strokes: number;
}

/** The shot matrix. Fixed and explicit so the fixture is reproducible. */
function shotMatrix(): { hole: string; shot: Shot }[] {
  const out: { hole: string; shot: Shot }[] = [];
  for (const hole of HOLES) {
    for (let a = 0; a < 5; a++) {
      for (let p = 0; p < 4; p++) {
        out.push({
          hole: hole.name,
          shot: { angle: -1.45 + a * 0.3, power: 130 + p * 100 },
        });
      }
    }
  }
  return out;
}

function holeByName(name: string) {
  const h = HOLES.find((x) => x.name === name);
  if (!h) throw new Error(`golden fixture references unknown hole: ${name}`);
  return h;
}

function run(entry: { hole: string; shot: Shot }): GoldenEntry {
  const r = simulateShot(createSim(holeByName(entry.hole)), entry.shot);
  return {
    hole: entry.hole,
    angle: entry.shot.angle,
    power: entry.shot.power,
    x: r.x,
    y: r.y,
    steps: r.steps,
    state: r.state,
    strokes: r.strokes,
  };
}

if (process.env.UPDATE_GOLDEN) {
  writeFileSync(FIXTURE, `${JSON.stringify(shotMatrix().map(run), null, 2)}\n`);
}

describe("golden shots", () => {
  const golden: GoldenEntry[] = JSON.parse(readFileSync(FIXTURE, "utf8"));

  it("has a fixture covering every hole", () => {
    expect(golden.length).toBe(shotMatrix().length);
    for (const hole of HOLES) {
      expect(golden.some((g) => g.hole === hole.name)).toBe(true);
    }
  });

  it("reproduces every recorded outcome exactly", () => {
    // Exact equality, not toBeCloseTo. A shot that lands a thousandth of a
    // pixel off is a shot whose ghost desyncs a few bounces later.
    const actual = golden.map((g) => run({ hole: g.hole, shot: { angle: g.angle, power: g.power } }));
    expect(actual).toEqual(golden);
  });

  it("contains shots that actually resolve differently", () => {
    // Guards against a fixture where everything dribbles to the same spot,
    // which would pass the comparison above while testing nothing.
    const spots = new Set(golden.map((g) => `${g.x},${g.y}`));
    expect(spots.size).toBeGreaterThan(golden.length / 2);
    expect(golden.some((g) => g.state === "holed" || g.strokes > 1)).toBe(true);
  });
});
