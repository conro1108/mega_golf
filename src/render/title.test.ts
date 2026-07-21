import { describe, it, expect, afterEach } from "vitest";
import { titleLayout, titleCellRect, titleHitTest } from "./draw";
import { setViewSize, BASE_W, BASE_H, VIEW } from "./view";

/**
 * The title screen is now laid out from the viewport rather than from fixed
 * offsets, and hit-testing derives from the same function that draws it. These
 * pin the two things that would silently break: every cell being tappable to
 * the hole it displays, and the whole block staying on screen at any shape.
 */

const COUNT = 18;
const SIZES = [
  { w: BASE_W, h: BASE_H, name: "landscape" },
  { w: 254, h: 510, name: "portrait phone" },
  { w: 560, h: 232, name: "short and wide" },
];

afterEach(() => setViewSize({ w: BASE_W, h: BASE_H }));

describe("title layout", () => {
  for (const size of SIZES) {
    describe(size.name, () => {
      it("hit-tests the centre of every cell back to its own hole", () => {
        setViewSize(size);
        for (let i = 0; i < COUNT; i++) {
          const c = titleCellRect(i, COUNT);
          expect(titleHitTest(c.x + c.w / 2, c.y + c.h / 2, COUNT)).toBe(i);
        }
      });

      it("keeps the play button and the grid inside the viewport", () => {
        setViewSize(size);
        const L = titleLayout(COUNT);
        expect(L.titleY).toBeGreaterThanOrEqual(0);
        expect(L.playX).toBeGreaterThanOrEqual(0);
        expect(L.playX + L.playW).toBeLessThanOrEqual(VIEW.w);
        const last = titleCellRect(COUNT - 1, COUNT);
        expect(L.gridLeft).toBeGreaterThanOrEqual(0);
        expect(L.gridLeft + L.cols * L.cellW).toBeLessThanOrEqual(VIEW.w);
        expect(last.y + last.h).toBeLessThanOrEqual(VIEW.h);
      });

      it("leaves a scenery band along the bottom", () => {
        setViewSize(size);
        const L = titleLayout(COUNT);
        expect(L.horizonY).toBeGreaterThan(0);
        expect(L.horizonY).toBeLessThan(VIEW.h);
      });
    });
  }

  it("centres the block in the space above the horizon", () => {
    setViewSize({ w: 254, h: 510 });
    const L = titleLayout(COUNT);
    const last = titleCellRect(COUNT - 1, COUNT);
    const above = L.titleY;
    const below = L.horizonY - (last.y + last.h);
    // Not exact — the horizon rounds — but the old layout left ~180 units of
    // dead space below and 10 above, which is the failure this guards.
    expect(Math.abs(above - below)).toBeLessThan(12);
  });

  it("hits the play button, and nothing in the gap above the grid", () => {
    const L = titleLayout(COUNT);
    expect(titleHitTest(VIEW.w / 2, L.playY + L.playH / 2, COUNT)).toBe(-1);
    expect(titleHitTest(VIEW.w / 2, L.pickY + 2, COUNT)).toBe(null);
  });

  it("returns null past the last hole in a partly filled final row", () => {
    const L = titleLayout(COUNT);
    const lastRow = L.gridTop + (L.rows - 1) * L.cellH + L.cellH / 2;
    const beyond = L.gridLeft + (L.cols - 0.5) * L.cellW;
    // 18 holes in 3- or 6-wide rows fill exactly; 17 does not.
    expect(titleHitTest(beyond, lastRow, 17)).toBe(null);
  });
});
