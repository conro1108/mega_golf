/**
 * The shell: which screen you're on, which course and hole, and the round.
 *
 * Everything here changes at human speed — a tap, a hole ending — which is
 * exactly the state React is good for. Anything that changes per frame lives
 * in `PlaySession` behind the canvas and never reaches this file.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { COURSES } from "../holes";
import type { Shot } from "../engine/world";
import { loadBest, saveBestIfBetter, memoryStorage, type Storage } from "../persistence";
import { TitleScreen } from "./TitleScreen";
import { PlayScreen } from "./PlayScreen";
import { Scorecard } from "./Scorecard";

function getStorage(): Storage {
  try {
    const probe = "megagolf:__probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private browsing / storage disabled: fall back so the game still runs.
    return memoryStorage();
  }
}

type Route = "title" | "playing" | "scorecard";

export function App(): React.JSX.Element {
  const storage = useRef<Storage | null>(null);
  storage.current ??= getStorage();
  const store = storage.current;

  const [route, setRoute] = useState<Route>("title");
  const [courseIndex, setCourseIndex] = useState(0);
  const [holeIndex, setHoleIndex] = useState(0);
  /**
   * This session's official scorecard — first completion per hole, per
   * DESIGN.md — kept per course, so playing a few top-down holes doesn't
   * disturb a side-view round in progress.
   */
  const [roundStrokes, setRoundStrokes] = useState<(number | null)[][]>(() =>
    COURSES.map((c) => c.holes.map(() => null)),
  );
  /** Bumped whenever a best is written, to re-read them from storage. */
  const [bestsVersion, setBestsVersion] = useState(0);

  const course = COURSES[courseIndex];
  const holes = course.holes;

  const bestStrokes = useMemo(
    () => holes.map((h) => loadBest(store, h.name)?.strokes ?? null),
    // `bestsVersion` is the invalidation signal; storage itself isn't reactive.
    [holes, store, bestsVersion],
  );

  const hole = holes[holeIndex] ?? holes[0];
  const ghostShots = useMemo(
    () => loadBest(store, hole.name)?.shots ?? null,
    [hole, store, bestsVersion],
  );

  const scores = roundStrokes[courseIndex];
  const firstUnplayed = Math.max(0, scores.indexOf(null));

  /** Strokes-to-par across holes completed so far this round, or null before the first. */
  const roundToPar = useMemo(() => {
    let strokes = 0;
    let par = 0;
    let any = false;
    for (let i = 0; i < holes.length; i++) {
      if (scores[i] === null) continue;
      strokes += scores[i]!;
      par += holes[i].par;
      any = true;
    }
    return any ? strokes - par : null;
  }, [holes, scores]);

  const openHole = useCallback((i: number) => {
    setHoleIndex(i);
    setRoute("playing");
  }, []);

  const handleHoled = useCallback(
    (strokes: number, shots: readonly Shot[]): boolean => {
      setRoundStrokes((prev) => {
        if (prev[courseIndex][holeIndex] !== null) return prev;
        const next = prev.map((row) => row.slice());
        next[courseIndex][holeIndex] = strokes;
        return next;
      });
      const better = saveBestIfBetter(store, hole.name, { strokes, shots });
      if (better) setBestsVersion((v) => v + 1);
      return better;
    },
    [courseIndex, holeIndex, hole, store],
  );

  const handleNext = useCallback(() => {
    if (holeIndex === holes.length - 1) setRoute("scorecard");
    else setHoleIndex(holeIndex + 1);
  }, [holeIndex, holes.length]);

  if (route === "playing") {
    return (
      <PlayScreen
        hole={hole}
        holeNumber={holeIndex + 1}
        holeCount={holes.length}
        roundToPar={roundToPar}
        ghostShots={ghostShots}
        onHoled={handleHoled}
        onNext={handleNext}
        onMenu={() => setRoute("title")}
      />
    );
  }

  if (route === "scorecard") {
    return <Scorecard course={course} strokes={scores} onDone={() => setRoute("title")} />;
  }

  return (
    <TitleScreen
      courses={COURSES}
      courseIndex={courseIndex}
      bestStrokes={bestStrokes}
      furthestUnplayed={firstUnplayed}
      onPickCourse={setCourseIndex}
      onPlay={openHole}
    />
  );
}
