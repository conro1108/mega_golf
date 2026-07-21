import { describe, it, expect } from "vitest";
import { loadBest, saveBestIfBetter, memoryStorage, bestKey } from "./persistence";

describe("persistence", () => {
  it("has no best run for a hole that's never been saved", () => {
    expect(loadBest(memoryStorage(), "Warm Up")).toBeNull();
  });

  it("saves the first run unconditionally", () => {
    const storage = memoryStorage();
    const run = { strokes: 3, shots: [{ angle: -0.5, power: 300 }] };
    expect(saveBestIfBetter(storage, "Warm Up", run)).toBe(true);
    expect(loadBest(storage, "Warm Up")).toEqual(run);
  });

  it("keeps the better (lower-stroke) run and rejects a worse one", () => {
    const storage = memoryStorage();
    saveBestIfBetter(storage, "Warm Up", { strokes: 3, shots: [{ angle: 0, power: 1 }] });
    const improved = saveBestIfBetter(storage, "Warm Up", { strokes: 2, shots: [{ angle: 0, power: 2 }] });
    expect(improved).toBe(true);
    expect(loadBest(storage, "Warm Up")?.strokes).toBe(2);

    const worse = saveBestIfBetter(storage, "Warm Up", { strokes: 5, shots: [{ angle: 0, power: 3 }] });
    expect(worse).toBe(false);
    expect(loadBest(storage, "Warm Up")?.strokes).toBe(2);
  });

  it("keeps separate best runs per hole", () => {
    const storage = memoryStorage();
    saveBestIfBetter(storage, "Warm Up", { strokes: 2, shots: [] });
    saveBestIfBetter(storage, "The Beach", { strokes: 4, shots: [] });
    expect(loadBest(storage, "Warm Up")?.strokes).toBe(2);
    expect(loadBest(storage, "The Beach")?.strokes).toBe(4);
  });

  it("treats corrupt JSON as no best run rather than throwing", () => {
    const storage = memoryStorage();
    storage.setItem(bestKey("Warm Up"), "{not json");
    expect(loadBest(storage, "Warm Up")).toBeNull();
  });

  it("treats a value missing the expected shape as no best run", () => {
    const storage = memoryStorage();
    storage.setItem(bestKey("Warm Up"), JSON.stringify({ strokes: 3 }));
    expect(loadBest(storage, "Warm Up")).toBeNull();
    storage.setItem(bestKey("Warm Up"), JSON.stringify({ strokes: 3, shots: [{ angle: "x", power: 1 }] }));
    expect(loadBest(storage, "Warm Up")).toBeNull();
  });

  it("ignores a best recorded under an earlier physics epoch", () => {
    const storage = memoryStorage();
    // A run saved before the sim changed: replaying it would desync, so it
    // must read as "no best" rather than as a ghost that wanders off.
    storage.setItem("megagolf:best:Warm Up", JSON.stringify({ strokes: 2, shots: [{ angle: 0.1, power: 200 }] }));
    expect(loadBest(storage, "Warm Up")).toBeNull();
  });
});
