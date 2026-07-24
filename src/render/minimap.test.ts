import { describe, it, expect, afterEach } from "vitest";
import { minimapRect, minimapHitTest, minimapOccluded, needsOverview, overviewZoom } from "./minimap";
import { createGame, placeBall } from "../engine/game";
import { setViewSize, BASE_W, BASE_H, VIEW } from "./view";
import { cameraAxis } from "./view";
import type { Hole } from "../engine/world";

function hole(width: number, height: number): Hole {
  return {
    name: "t",
    idea: "t",
    par: 3,
    width,
    height,
    start: [10, 10],
    cup: [width - 10, height - 10],
    terrain: [],
  };
}

afterEach(() => setViewSize({ w: BASE_W, h: BASE_H }));

describe("needsOverview", () => {
  it("is off for a hole that already fits on screen", () => {
    expect(needsOverview(hole(BASE_W, BASE_H))).toBe(false);
  });

  it("is on when the hole runs off either edge", () => {
    expect(needsOverview(hole(1400, BASE_H))).toBe(true);
    expect(needsOverview(hole(BASE_W, 700))).toBe(true);
  });

  it("ignores a hole only marginally bigger than the viewport", () => {
    // The viewport takes the *window's* aspect, so a stock 480x270 hole
    // overflows by a handful of units on plenty of ordinary screens. That is
    // not worth a corner map covering a hole you can already see all of.
    setViewSize({ w: 476, h: 272 });
    expect(needsOverview(hole(480, 270))).toBe(false);
  });
});

describe("minimapOccluded", () => {
  const h = hole(1400, 760);

  it("is true when the cup sits behind the map", () => {
    const game = createGame(h);
    const r = minimapRect(h);
    // Put the camera so the cup lands in the middle of the map's box.
    const camX = h.cup[0] - (r.x + r.w / 2);
    const camY = h.cup[1] - (r.y + r.h / 2);
    // Park the ball far away so the cup is what triggers it.
    placeBall(game, camX + 10, camY + VIEW.h - 10);
    expect(minimapOccluded(game, camX, camY, 1)).toBe(true);
  });

  it("is true when the ball sits behind the map", () => {
    const game = createGame(h);
    const r = minimapRect(h);
    const camX = 0;
    const camY = 0;
    placeBall(game, r.x + r.w / 2, r.y + r.h / 2);
    expect(minimapOccluded(game, camX, camY, 1)).toBe(true);
  });

  it("is false when neither is anywhere near it", () => {
    const game = createGame(h);
    placeBall(game, 10, 700);
    expect(minimapOccluded(game, 0, 0, 1)).toBe(false);
  });
});

describe("minimapRect", () => {
  it("keeps the hole's aspect ratio", () => {
    const h = hole(1400, 700);
    const r = minimapRect(h);
    expect(r.w / r.h).toBeCloseTo(2, 6);
  });

  it("stays inside the viewport for both a wide and a tall hole", () => {
    for (const h of [hole(1400, 760), hole(300, 700)]) {
      const r = minimapRect(h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(VIEW.w);
      expect(r.y + r.h).toBeLessThanOrEqual(VIEW.h);
    }
  });

  it("shrinks with a portrait viewport instead of overflowing it", () => {
    setViewSize({ w: 254, h: 510 });
    const r = minimapRect(hole(1400, 760));
    expect(r.x + r.w).toBeLessThanOrEqual(VIEW.w);
    expect(r.w).toBeLessThanOrEqual(VIEW.w * 0.32);
  });
});

describe("minimapHitTest", () => {
  const h = hole(1400, 760);

  it("hits inside the map and just outside it (thumb slop)", () => {
    const r = minimapRect(h);
    expect(minimapHitTest(h, r.x + r.w / 2, r.y + r.h / 2)).toBe(true);
    expect(minimapHitTest(h, r.x - 4, r.y - 4)).toBe(true);
  });

  it("misses well away from the map", () => {
    expect(minimapHitTest(h, 8, VIEW.h - 8)).toBe(false);
  });

  it("never hits when there is no map drawn", () => {
    const fits = hole(BASE_W, BASE_H);
    const r = minimapRect(fits);
    expect(minimapHitTest(fits, r.x + r.w / 2, r.y + r.h / 2)).toBe(false);
  });
});

describe("overviewZoom", () => {
  it("fits the whole hole on screen on both axes", () => {
    const h = hole(1400, 760);
    const z = overviewZoom(h);
    expect(h.width * z).toBeLessThanOrEqual(VIEW.w);
    expect(h.height * z).toBeLessThanOrEqual(VIEW.h);
  });

  it("never zooms in on a hole that already fits", () => {
    expect(overviewZoom(hole(240, 130))).toBe(1);
  });

  it("centres the camera on the hole once zoomed out", () => {
    // The overview is only useful if it shows the *whole* hole: at this zoom
    // the effective viewport is wider than the world, which is precisely the
    // case `cameraAxis` centres instead of clamping.
    const h = hole(1400, 760);
    const z = overviewZoom(h);
    const camX = cameraAxis(h.start[0], h.width, VIEW.w / z);
    const camY = cameraAxis(h.start[1], h.height, VIEW.h / z);
    expect(camX).toBeLessThanOrEqual(0);
    expect(camY).toBeLessThanOrEqual(0);
    expect(camX + VIEW.w / z).toBeGreaterThanOrEqual(h.width);
    expect(camY + VIEW.h / z).toBeGreaterThanOrEqual(h.height);
  });
});
