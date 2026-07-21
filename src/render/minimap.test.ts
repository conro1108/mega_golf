import { describe, it, expect, afterEach } from "vitest";
import { minimapRect, minimapHitTest, needsOverview, overviewZoom } from "./minimap";
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
