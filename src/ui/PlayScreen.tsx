/**
 * A hole in play: the canvas plus the HUD over it.
 *
 * The component owns the canvas element and nothing that happens inside it —
 * `PlaySession` takes the element on mount and drives it from there. React
 * re-renders only when the HUD numbers change, which is a handful of times a
 * hole rather than sixty times a second.
 */

import { useEffect, useRef, useState } from "react";
import { PlaySession, type Snapshot } from "../session";
import { isTopDown, type Hole, type Shot } from "../engine/world";

export interface PlayScreenProps {
  hole: Hole;
  holeNumber: number;
  holeCount: number;
  /** Strokes-to-par across holes already completed this round, or null before any. */
  roundToPar: number | null;
  ghostShots: readonly Shot[] | null;
  onHoled(strokes: number, shots: readonly Shot[]): boolean;
  onNext(): void;
  onMenu(): void;
}

/** The name a finished hole gets on the banner. */
function verdict(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1) return "ACE";
  if (d < -1) return "EAGLE";
  if (d === -1) return "BIRDIE";
  if (d === 0) return "PAR";
  if (d === 1) return "BOGEY";
  return `+${d}`;
}

export function PlayScreen({
  hole,
  holeNumber,
  holeCount,
  roundToPar,
  ghostShots,
  onHoled,
  onNext,
  onMenu,
}: PlayScreenProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<PlaySession | null>(null);
  const [snap, setSnap] = useState<Snapshot>({ strokes: 0, holed: false, lie: undefined });
  const [isNewBest, setIsNewBest] = useState(false);

  // `onHoled` closes over round state that changes as you play, so it is held
  // in a ref: the session is built once and must not capture a stale version.
  const holedRef = useRef(onHoled);
  holedRef.current = onHoled;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const session = new PlaySession(canvas, {
      onSnapshot: setSnap,
      onHoled: (strokes, shots) => setIsNewBest(holedRef.current(strokes, shots)),
    });
    sessionRef.current = session;
    return () => {
      session.destroy();
      sessionRef.current = null;
    };
  }, []);

  // Deliberately *not* a dependency of the load effect below. Holing out saves
  // a new best, which changes the ghost — and a ghost change must not reopen
  // the hole, or finishing one instantly restarts it and eats the banner. The
  // ghost is read when a hole opens and otherwise left alone.
  const ghostRef = useRef(ghostShots);
  ghostRef.current = ghostShots;

  useEffect(() => {
    setIsNewBest(false);
    sessionRef.current?.load(hole, ghostRef.current);
  }, [hole]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "o") sessionRef.current?.toggleOverview();
      // A retry picks up whatever the best is now, so a run you just recorded
      // becomes the ghost you play against next.
      if (e.key === "r") {
        setIsNewBest(false);
        sessionRef.current?.load(hole, ghostRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hole]);

  const topDown = isTopDown(hole);

  return (
    <>
      <div className="backdrop">
        <canvas ref={canvasRef} />
      </div>
      <div className="hud">
        <div className="hud-top">
          <div>
            <div className="hole-name">
              {holeNumber}/{holeCount} {hole.name}
            </div>
            <div>
              <span className="strokes">{snap.strokes}</span>
              <span className="par">par {hole.par}</span>
            </div>
            <div className={`lens ${topDown ? "top" : "side"}`}>
              {topDown ? "▦ TOP-DOWN" : "▤ SIDE VIEW"}
            </div>
          </div>
          <div className="round">
            round: {roundToPar === null ? "—" : roundToPar === 0 ? "E" : roundToPar > 0 ? `+${roundToPar}` : roundToPar}
          </div>
        </div>

        <button className="menu" onClick={onMenu}>
          ⌂ MENU
        </button>

        {snap.holed && (
          <button className="banner" onClick={onNext}>
            <b>{verdict(snap.strokes, hole.par)}</b>
            <span>tap for next hole</span>
            {isNewBest && <em>new best — ghost updated</em>}
          </button>
        )}
      </div>
    </>
  );
}
