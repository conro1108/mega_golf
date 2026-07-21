/**
 * The render viewport: how much world the screen shows, and where the camera
 * sits inside a hole.
 *
 * The buffer used to be a fixed 480x270 landscape rectangle, which is why a
 * phone held portrait got a "rotate me" screen instead of a game. Instead the
 * viewport now takes the *shape* of the window while keeping roughly the same
 * pixel area — so a portrait phone sees a tall, narrow slice of the hole at
 * about the same zoom a landscape one sees a wide slice. Nothing here feeds
 * the simulation; it only decides what's on screen.
 */

export const BASE_W = 480;
export const BASE_H = 270;

/** Held constant across aspect ratios so the art stays the same size on screen. */
const TARGET_AREA = BASE_W * BASE_H;

/**
 * Extreme aspect ratios (a split-screen sliver, a desktop ultrawide) would
 * otherwise produce a viewport so narrow on one axis that you can't see the
 * next bounce. Past these bounds we letterbox instead of zooming out further.
 */
const MIN_DIM = 220;
const MAX_DIM = 560;

export interface ViewSize {
  w: number;
  h: number;
}

/** Viewport dimensions for a window of this size, in world units. */
export function computeViewSize(winW: number, winH: number): ViewSize {
  if (!(winW > 0) || !(winH > 0)) return { w: BASE_W, h: BASE_H };
  const aspect = winW / winH;
  return {
    w: quantize(Math.sqrt(TARGET_AREA * aspect)),
    h: quantize(Math.sqrt(TARGET_AREA / aspect)),
  };
}

/** Even integers keep the centre of the viewport on a whole pixel. */
function quantize(v: number): number {
  const clamped = v < MIN_DIM ? MIN_DIM : v > MAX_DIM ? MAX_DIM : v;
  return 2 * Math.round(clamped / 2);
}

/** The live viewport. Mutated by `setViewSize` on resize; read by the renderer. */
export const VIEW: ViewSize = { w: BASE_W, h: BASE_H };

export function setViewSize(size: ViewSize): void {
  VIEW.w = size.w;
  VIEW.h = size.h;
}

/**
 * Camera position on one axis: follow the ball, clamped inside the hole —
 * except when the hole is smaller than the viewport on this axis, where it's
 * centred instead. Portrait makes that the common case (most side-view holes
 * are 270 tall against a ~530-tall viewport), and pinning such a hole to the
 * top edge would leave all the dead space under the player's thumb.
 */
export function cameraAxis(ballPos: number, worldSize: number, viewSize: number): number {
  if (worldSize <= viewSize) return (worldSize - viewSize) / 2;
  const target = ballPos - viewSize / 2;
  return target < 0 ? 0 : target > worldSize - viewSize ? worldSize - viewSize : target;
}
