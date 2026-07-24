/**
 * End-of-round scorecard. Split main holes from the mega finale, because the
 * finale is par 8+ on its own and burying it in a total hides the shape of
 * the round.
 */

import type { Course } from "../holes";

export interface ScorecardProps {
  course: Course;
  /** This session's official score per hole — first completion only, per DESIGN.md. */
  strokes: (number | null)[];
  onDone(): void;
}

interface Section {
  par: number;
  strokes: number;
  played: number;
  of: number;
}

export function Scorecard({ course, strokes, onDone }: ScorecardProps): React.JSX.Element {
  const holes = course.holes;

  const section = (from: number, to: number): Section => {
    let par = 0;
    let total = 0;
    let played = 0;
    for (let i = from; i < to; i++) {
      par += holes[i].par;
      if (strokes[i] !== null) {
        total += strokes[i]!;
        played++;
      }
    }
    return { par, strokes: total, played, of: to - from };
  };

  const last = holes.length - 1;
  const rows: [string, Section][] = [
    [`HOLES 1-${last}`, section(0, last)],
    ["MEGA HOLE", section(last, holes.length)],
  ];
  const total = section(0, holes.length);
  const diff = total.strokes - total.par;

  return (
    <div className="screen scorecard" onClick={onDone}>
      <h1>SCORECARD</h1>
      <p>{course.name}</p>

      <div className="rows">
        {rows.map(([label, s]) => (
          <div key={label}>
            <span>{label}</span>
            <span className={s.played === s.of ? undefined : "pending"}>
              {s.played === s.of ? `${s.strokes} (par ${s.par})` : `${s.played}/${s.of} played`}
            </span>
          </div>
        ))}
        <div className="total">
          <span>TOTAL</span>
          <span>
            {total.played === total.of
              ? `${total.strokes} (${diff === 0 ? "E" : diff > 0 ? `+${diff}` : diff})`
              : `${total.played}/${total.of} played`}
          </span>
        </div>
      </div>

      <p>tap for title</p>
    </div>
  );
}
