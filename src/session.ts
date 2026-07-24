/**
 * The play surface: canvas sizing, pointer input, camera, and the render loop.
 *
 * This is deliberately *not* React. Matter's `Runner` drives physics on its own
 * clock and the camera eases toward the ball every frame — sixty state updates
 * a second, none of which any component wants to re-render on. So React owns
 * the shell (which screen you're on, the scorecard, the HUD numbers) and this
 * owns the frame, with `onSnapshot` as the narrow bridge between them: it fires
 * only when a value the HUD actually shows has changed.
 */

import {
  createGame,
  destroyGame,
  maxPowerForLie,
  pauseGame,
  runGame,
  strike,
  type Game,
} from "./engine/game";
import type { Hole, MaterialId, Shot } from "./engine/world";
import { draw, drawAim, SINK_FRAMES } from "./render/draw";
import { VIEW, cameraAxis, fitCanvas } from "./render/view";
import { drawMinimap, minimapHitTest, overviewZoom } from "./render/minimap";

const MAX_DRAG = 70;
/** Minimum drag to register as a shot at all — small enough to allow a real gentle tap-in. */
const MIN_POWER = 6;

/** Everything the React shell needs to know about a hole in progress. */
export interface Snapshot {
  strokes: number;
  holed: boolean;
  /** The lie the next shot plays from; a sand lie caps power. */
  lie: MaterialId | undefined;
}

export interface SessionHooks {
  onSnapshot(s: Snapshot): void;
  /** Fired once, the moment the ball drops, with the shots that got it there. */
  onHoled(strokes: number, shots: readonly Shot[]): void;
}

export class PlaySession {
  private ctx: CanvasRenderingContext2D;
  private game: Game | null = null;
  private ghost: { game: Game; shots: readonly Shot[]; next: number } | null = null;

  private scale = 1;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private overview = false;

  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private aimAngle = 0;
  private aimPower = 0;

  private holedFrames = 0;
  private reported = false;
  private last: Snapshot = { strokes: 0, holed: false, lie: undefined };
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: SessionHooks,
  ) {
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onRelease);
    canvas.addEventListener("pointercancel", this.onRelease);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onRelease);
    this.canvas.removeEventListener("pointercancel", this.onRelease);
    this.clearGames();
  }

  private clearGames(): void {
    if (this.game) destroyGame(this.game);
    if (this.ghost) destroyGame(this.ghost.game);
    this.game = null;
    this.ghost = null;
  }

  /** Open a hole, optionally with a past best run to replay as a ghost. */
  load(hole: Hole, ghostShots: readonly Shot[] | null): void {
    this.clearGames();
    this.game = createGame(hole);
    runGame(this.game);

    if (ghostShots && ghostShots.length > 0) {
      const g = createGame(hole);
      runGame(g);
      this.ghost = { game: g, shots: ghostShots, next: 0 };
    }

    this.shots = [];
    this.holedFrames = 0;
    this.reported = false;
    this.overview = false;
    this.zoom = 1;
    this.dragging = false;
    this.aimPower = 0;
    this.updateCamera(true);
    this.publish();
  }

  /** Shots taken this attempt, recorded so a new best can be replayed later. */
  private shots: Shot[] = [];

  /** Stop stepping physics — used while the shell is showing another screen. */
  pause(): void {
    if (this.game) pauseGame(this.game);
    if (this.ghost) pauseGame(this.ghost.game);
  }

  private publish(): void {
    if (!this.game) return;
    const next: Snapshot = {
      strokes: this.game.strokes,
      holed: this.game.state === "holed",
      lie: this.game.groundMaterial,
    };
    if (
      next.strokes !== this.last.strokes ||
      next.holed !== this.last.holed ||
      next.lie !== this.last.lie
    ) {
      this.last = next;
      this.hooks.onSnapshot(next);
    }
  }

  private currentMaxPower(): number {
    return maxPowerForLie(this.game?.groundMaterial);
  }

  private resize = (): void => {
    const prevW = VIEW.w;
    const prevH = VIEW.h;
    this.scale = fitCanvas(this.canvas, this.ctx);
    // Mobile browsers fire `resize` every time the URL bar collapses; snapping
    // the camera on each of those would be a visible lurch mid-shot.
    if (this.game && (VIEW.w !== prevW || VIEW.h !== prevH)) this.updateCamera(true);
  };

  private updateCamera(snap: boolean): void {
    if (!this.game) return;
    const p = this.game.ball.position;
    // Zoomed out, one screen covers `VIEW.w / zoom` world units — the camera
    // has to clamp against that, or the overview pins itself to a corner.
    const targetX = cameraAxis(p.x, this.game.hole.width, VIEW.w / this.zoom);
    const targetY = cameraAxis(p.y, this.game.hole.height, VIEW.h / this.zoom);
    if (snap) {
      this.camX = targetX;
      this.camY = targetY;
    } else {
      this.camX += (targetX - this.camX) * 0.12;
      this.camY += (targetY - this.camY) * 0.12;
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.game) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / this.scale;
    const py = (e.clientY - rect.top) / this.scale;

    // While the overview is open the whole surface is a "close" button —
    // there's nothing to aim at from out here.
    if (this.overview) {
      this.overview = false;
      return;
    }
    if (minimapHitTest(this.game.hole, px, py)) {
      this.overview = true;
      return;
    }
    if (this.game.state !== "resting") return;
    this.dragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.aimPower = 0;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    // Pull back away from the intended direction, slingshot style.
    const dx = (this.dragStart.x - e.clientX) / this.scale;
    const dy = (this.dragStart.y - e.clientY) / this.scale;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) {
      this.aimPower = 0;
      return;
    }
    this.aimAngle = Math.atan2(dy, dx);
    // A curved map from drag length to power spreads more of the drag's usable
    // range across gentle putts; a linear one compresses every short-game shot
    // into the first few pixels.
    const frac = Math.min(len, MAX_DRAG) / MAX_DRAG;
    this.aimPower = Math.pow(frac, 0.65) * this.currentMaxPower();
  };

  private onRelease = (): void => {
    if (!this.dragging || !this.game) return;
    this.dragging = false;
    if (this.aimPower < MIN_POWER) return;
    const shot: Shot = { angle: this.aimAngle, power: this.aimPower };
    this.shots.push(shot);
    strike(this.game, shot);
    this.aimPower = 0;
    this.publish();
  };

  /** Keyboard shortcuts the shell forwards while a hole is open. */
  toggleOverview(): void {
    this.overview = !this.overview;
  }

  private advanceGhost(): void {
    const g = this.ghost;
    if (!g) return;
    if (g.game.state === "resting" && g.next < g.shots.length) {
      strike(g.game, g.shots[g.next]);
      g.next += 1;
    }
  }

  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const game = this.game;
    if (!game) return;

    this.advanceGhost();

    const tz = this.overview ? overviewZoom(game.hole) : 1;
    this.zoom += (tz - this.zoom) * 0.2;
    if (Math.abs(tz - this.zoom) < 0.002) this.zoom = tz;
    this.updateCamera(false);

    if (game.state === "holed") {
      if (!this.reported) {
        this.reported = true;
        this.hooks.onHoled(game.strokes, this.shots);
      }
      if (this.holedFrames < SINK_FRAMES) this.holedFrames += 1;
    }
    this.publish();

    draw(
      this.ctx,
      game,
      this.camX,
      this.camY,
      this.ghost ? this.ghost.game.ball.position : null,
      this.holedFrames / SINK_FRAMES,
      this.zoom,
    );
    if (this.dragging && this.aimPower > 0) {
      drawAim(
        this.ctx,
        game,
        this.camX,
        this.camY,
        this.aimAngle,
        this.aimPower,
        this.currentMaxPower(),
        this.zoom,
      );
    }
    drawMinimap(this.ctx, game, this.camX, this.camY, this.zoom, this.overview);
  };
}
