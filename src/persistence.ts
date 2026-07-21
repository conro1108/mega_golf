/**
 * Local persistence: per-hole best runs (what the ghost replays) and which
 * holes have been recorded this session (DESIGN.md: the scorecard should be
 * first-attempt-per-session, so a practice replay can't quietly improve your
 * "official" score). No online layer yet, so this is all `localStorage` —
 * see DESIGN.md's async layer notes for what this is building toward.
 *
 * Takes a `Storage` (the `getItem`/`setItem` shape `window.localStorage`
 * already has) rather than reaching for the global directly, so it's
 * testable without a DOM.
 */

import type { Shot } from "./engine/world";

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BestRun {
  strokes: number;
  shots: readonly Shot[];
}

const BEST_PREFIX = "megagolf:best:";

/** In-memory fallback so the game still runs somewhere storage is unavailable (private browsing, quota). */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

export function loadBest(storage: Storage, holeName: string): BestRun | null {
  const raw = storage.getItem(BEST_PREFIX + holeName);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BestRun>;
    if (typeof parsed.strokes !== "number" || !Array.isArray(parsed.shots)) return null;
    for (const s of parsed.shots) {
      if (typeof s.angle !== "number" || typeof s.power !== "number") return null;
    }
    return { strokes: parsed.strokes, shots: parsed.shots as Shot[] };
  } catch {
    // Corrupt or foreign data in that key: treat as no best run rather than throwing.
    return null;
  }
}

/** Saves the run as the new best if it beats (or there's no) existing one. Returns whether it saved. */
export function saveBestIfBetter(storage: Storage, holeName: string, run: BestRun): boolean {
  const existing = loadBest(storage, holeName);
  if (existing && existing.strokes <= run.strokes) return false;
  storage.setItem(BEST_PREFIX + holeName, JSON.stringify(run));
  return true;
}
