import { describe, it, expect, afterEach } from "vitest";
import { titleLayout, titleCellRect, titleTabRect, titleHitTest } from "./draw";
import { setViewSize, BASE_W, BASE_H, VIEW } from "./view";

/**
 * The title screen is laid out from the viewport rather than from fixed
 * offsets, and hit-testing derives from the same functions that draw it. These
 * pin what would silently break: every cell and every course tab being
 * tappable to the thing it displays, and the block staying on screen at any
 * shape.
 */

const COUNT = 10;
const COURSES = 2;
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
          const c = titleCellRect(i, COUNT, COURSES);
          expect(titleHitTest(c.x + c.w / 2, c.y + c.h / 2, COUNT, COURSES)).toEqual({
            kind: "hole",
            index: i,
          });
        }
      });

      it("hit-tests each course tab back to its own course", () => {
        setViewSize(size);
        for (let i = 0; i < COURSES; i++) {
          const t = titleTabRect(i, COUNT, COURSES);
          expect(titleHitTest(t.x + t.w / 2, t.y + t.h / 2, COUNT, COURSES)).toEqual({
            kind: "course",
            index: i,
          });
        }
      });

      it("keeps the tabs, play button and grid inside the viewport", () => {
        setViewSize(size);
        const L = titleLayout(COUNT, COURSES);
        expect(L.titleY).toBeGreaterThanOrEqual(0);
        expect(L.playX).toBeGreaterThanOrEqual(0);
        expect(L.playX + L.playW).toBeLessThanOrEqual(VIEW.w);
        expect(L.tabLeft).toBeGreaterThanOrEqual(0);
        const lastTab = titleTabRect(COURSES - 1, COUNT, COURSES);
        expect(lastTab.x + lastTab.w).toBeLessThanOrEqual(VIEW.w);
        const last = titleCellRect(COUNT - 1, COUNT, COURSES);
        expect(L.gridLeft).toBeGreaterThanOrEqual(0);
        expect(L.gridLeft + L.cols * L.cellW).toBeLessThanOrEqual(VIEW.w);
        expect(last.y + last.h).toBeLessThanOrEqual(VIEW.h);
      });

      it("leaves a scenery band along the bottom", () => {
        setViewSize(size);
        const L = titleLayout(COUNT, COURSES);
        expect(L.horizonY).toBeGreaterThan(0);
        expect(L.horizonY).toBeLessThan(VIEW.h);
      });

      it("never overlaps a tab with the play button", () => {
        setViewSize(size);
        const L = titleLayout(COUNT, COURSES);
        for (let i = 0; i < COURSES; i++) {
          expect(titleTabRect(i, COUNT, COURSES).y + L.tabH).toBeLessThanOrEqual(L.playY);
        }
      });
    });
  }

  it("hits the play button, and nothing in the gap above the grid", () => {
    const L = titleLayout(COUNT, COURSES);
    expect(titleHitTest(VIEW.w / 2, L.playY + L.playH / 2, COUNT, COURSES)).toEqual({ kind: "play" });
    expect(titleHitTest(VIEW.w / 2, L.pickY + 2, COUNT, COURSES)).toBe(null);
  });

  it("returns null past the last hole in a partly filled final row", () => {
    const L = titleLayout(9, COURSES);
    const lastRow = L.gridTop + (L.rows - 1) * L.cellH + L.cellH / 2;
    const beyond = L.gridLeft + (L.cols - 0.5) * L.cellW;
    expect(titleHitTest(beyond, lastRow, 9, COURSES)).toBe(null);
  });
});
