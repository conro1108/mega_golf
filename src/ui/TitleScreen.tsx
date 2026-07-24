/**
 * Title screen: game name, the two courses as tabs, and the selected course's
 * progress, play button and hole grid.
 *
 * Picking a perspective is the first decision the game asks for, so the two
 * courses are the most prominent thing under the wordmark rather than a
 * setting buried somewhere.
 *
 * The dusk sky and hills behind this are still canvas (`drawTitleBackdrop`) —
 * they're the game's own art, not chrome — but everything you can press is
 * real DOM, which is what got the menu its finger-sized touch targets.
 */

import { useEffect, useRef } from "react";
import type { Course } from "../holes";
import { drawTitleBackdrop } from "../render/draw";
import { fitCanvas } from "../render/view";

function Backdrop(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const resize = (): void => void fitCanvas(canvas, ctx);
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      // The pennant on the middle ridge is the one moving thing on the screen,
      // which is most of what sells it as alive rather than as a still.
      drawTitleBackdrop(ctx, (now - start) / 1000);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="backdrop">
      <canvas ref={ref} />
    </div>
  );
}

export interface TitleScreenProps {
  courses: Course[];
  courseIndex: number;
  bestStrokes: (number | null)[];
  /** First hole with no recorded round score; 0 means nothing played yet. */
  furthestUnplayed: number;
  onPickCourse(i: number): void;
  onPlay(holeIndex: number): void;
}

export function TitleScreen({
  courses,
  courseIndex,
  bestStrokes,
  furthestUnplayed,
  onPickCourse,
  onPlay,
}: TitleScreenProps): React.JSX.Element {
  const course = courses[courseIndex];
  const holes = course.holes;
  const done = bestStrokes.reduce<number>((n, s) => n + (s !== null ? 1 : 0), 0);

  return (
    <>
      <Backdrop />
      <div className="screen title">
        <h1 className="wordmark">MEGA GOLF</h1>
        <p className="tagline">two courses, two ways to play</p>

        <div className="tabs" role="tablist" aria-label="Course">
          {courses.map((c, i) => (
            <button
              key={c.id}
              role="tab"
              className="tab"
              aria-selected={i === courseIndex}
              onClick={() => onPickCourse(i)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <p className="blurb">{course.blurb}</p>

        <div className="progress">
          <span>
            {done} of {holes.length} holes bested
          </span>
          <div className="track">
            <div style={{ width: `${(done / holes.length) * 100}%` }} />
          </div>
        </div>

        <button className="play" onClick={() => onPlay(furthestUnplayed)}>
          {furthestUnplayed > 0 ? "CONTINUE ROUND" : "PLAY ROUND"}
        </button>

        <p className="pick">— or pick a hole —</p>
        <div className="grid">
          {holes.map((hole, i) => {
            const isMega = i === holes.length - 1;
            const best = bestStrokes[i];
            return (
              <button
                key={hole.name}
                className={`cell${best !== null ? " played" : ""}${isMega ? " mega" : ""}`}
                onClick={() => onPlay(i)}
              >
                <b>{isMega ? "MEGA" : i + 1}</b>
                <small>{best !== null ? `best ${best}` : `par ${hole.par}`}</small>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
