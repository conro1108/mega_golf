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
export const MIN_DIM = 220;
export const MAX_DIM = 560;

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
 * How far past a hole's edge the camera may push, as a fraction of the
 * viewport. Clamping hard at the boundary shoved the ball into the corner of
 * the screen whenever you played near a wall — exactly when you most want to
 * see where the shot is going, and on a phone exactly where your thumb is.
 * Overscanning shows a strip of backdrop instead, which the renderer already
 * draws for any hole shorter than the viewport.
 */
export const OVERSCAN = 0.18;

/**
 * Camera position on one axis: follow the ball, clamped inside the hole plus
 * an overscan margin — except when the hole is smaller than the viewport on
 * this axis, where it's centred instead. Portrait makes that the common case
 * (most side-view holes are 270 tall against a ~530-tall viewport), and
 * pinning such a hole to the top edge would leave all the dead space under the
 * player's thumb.
 */
export function cameraAxis(ballPos: number, worldSize: number, viewSize: number): number {
  if (worldSize <= viewSize) return (worldSize - viewSize) / 2;
  const pad = viewSize * OVERSCAN;
  const target = ballPos - viewSize / 2;
  const lo = -pad;
  const hi = worldSize - viewSize + pad;
  return target < lo ? lo : target > hi ? hi : target;
}

/**
 * Size a canvas to the available content box at the display's real resolution,
 * update `VIEW` to match its shape, and bake the world-to-device scale into
 * the context transform. Returns the CSS-pixels-per-world-unit factor, which
 * is what pointer coordinates have to be divided by.
 *
 * Shared by the play surface and the title backdrop so both agree on what one
 * world unit is on screen.
 */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): number {
  // Measure the padded content box, not the window: `body` is inset by the
  // safe-area env() values, so sizing from innerWidth/innerHeight overflows an
  // `overflow: hidden` body and clips the canvas at both ends.
  const style = getComputedStyle(document.body);
  const pad = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const availW = window.innerWidth - pad(style.paddingLeft) - pad(style.paddingRight);
  const availH = window.innerHeight - pad(style.paddingTop) - pad(style.paddingBottom);

  setViewSize(computeViewSize(availW, availH));

  // Fill the available space rather than snapping to whole-number scales: on
  // most phone viewports an integer-only scale leaves a third of the screen as
  // dead black bars.
  const scale = Math.min(availW / VIEW.w, availH / VIEW.h);

  // Everything the renderer draws is vector, so there is no reason to
  // rasterise into a tiny buffer and stretch it — that was the blurriness.
  const dpr = window.devicePixelRatio || 1;
  const cssW = VIEW.w * scale;
  const cssH = VIEW.h * scale;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(canvas.width / VIEW.w, 0, 0, canvas.height / VIEW.h, 0, 0);
  ctx.imageSmoothingEnabled = true;
  return scale;
}
