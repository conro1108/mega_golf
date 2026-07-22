import { describe, expect, it } from "vitest";
import { BASE_H, BASE_W, MAX_DIM, MIN_DIM, OVERSCAN, cameraAxis, computeViewSize } from "./view";

describe("computeViewSize", () => {
  it("reproduces the authored 16:9 viewport on a 16:9 window", () => {
    expect(computeViewSize(1920, 1080)).toEqual({ w: BASE_W, h: BASE_H });
  });

  it("is taller than it is wide on a portrait phone", () => {
    const v = computeViewSize(390, 844);
    expect(v.h).toBeGreaterThan(v.w);
  });

  it("keeps roughly the same pixel area either way, so the art stays the same size", () => {
    const landscape = computeViewSize(844, 390);
    const portrait = computeViewSize(390, 844);
    const area = BASE_W * BASE_H;
    for (const v of [landscape, portrait]) {
      expect(v.w * v.h).toBeGreaterThan(area * 0.9);
      expect(v.w * v.h).toBeLessThan(area * 1.1);
    }
  });

  it("rotating the device transposes the viewport", () => {
    const a = computeViewSize(390, 844);
    const b = computeViewSize(844, 390);
    expect(a.w).toBe(b.h);
    expect(a.h).toBe(b.w);
  });

  it("clamps extreme aspect ratios instead of zooming out forever", () => {
    const sliver = computeViewSize(200, 2000);
    expect(sliver.w).toBeGreaterThanOrEqual(MIN_DIM);
    expect(sliver.h).toBeLessThanOrEqual(MAX_DIM);
  });

  it("falls back to the base viewport for a degenerate window", () => {
    expect(computeViewSize(0, 0)).toEqual({ w: BASE_W, h: BASE_H });
    expect(computeViewSize(500, 0)).toEqual({ w: BASE_W, h: BASE_H });
  });

  it("returns even integers", () => {
    for (const [w, h] of [
      [390, 844],
      [1180, 820],
      [1366, 768],
      [333, 777],
    ]) {
      const v = computeViewSize(w, h);
      expect(v.w % 2).toBe(0);
      expect(v.h % 2).toBe(0);
      expect(Number.isInteger(v.w)).toBe(true);
      expect(Number.isInteger(v.h)).toBe(true);
    }
  });
});

describe("cameraAxis", () => {
  it("centres the ball when the hole is bigger than the viewport", () => {
    expect(cameraAxis(500, 1400, 480)).toBe(260);
  });

  it("overscans at both edges rather than jamming the ball into a corner", () => {
    const pad = 480 * OVERSCAN;
    expect(cameraAxis(10, 1400, 480)).toBe(-pad);
    expect(cameraAxis(1390, 1400, 480)).toBe(920 + pad);
  });

  it("keeps the ball on screen with room to spare at a wall", () => {
    // Ball flush against the right wall of a 1400-wide hole: it should still
    // sit a healthy margin in from the screen edge, not on it.
    const cam = cameraAxis(1400, 1400, 480);
    const screenX = 1400 - cam;
    expect(screenX).toBeLessThan(480 - 40);
  });

  it("never overscans so far the ball leaves the viewport", () => {
    for (const ball of [0, 5, 700, 1395, 1400]) {
      const cam = cameraAxis(ball, 1400, 480);
      expect(ball - cam).toBeGreaterThanOrEqual(0);
      expect(ball - cam).toBeLessThanOrEqual(480);
    }
  });

  it("centres the hole itself when it is smaller than the viewport", () => {
    // A 270-tall side-view hole on a 530-tall portrait viewport: the camera
    // ignores the ball entirely and hangs the fairway in the middle.
    expect(cameraAxis(40, 270, 530)).toBe(-130);
    expect(cameraAxis(200, 270, 530)).toBe(-130);
  });

  it("treats an exact fit as centred, with no jitter", () => {
    expect(cameraAxis(123, 480, 480)).toBe(0);
  });
});
