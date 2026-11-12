import assert from "node:assert/strict";
import { test } from "node:test";
import {
  yokeRepeatList,
  yokeRepeatNumber,
  yokeRepeatSides,
} from "./yoke-repeat-labels";
import {
  resolveYokeRound,
  yokeSeedLoops,
  type YokeOperation,
} from "./yoke-stitch-program";

test("front-first labels match the yoke halves without reordering the working round", () => {
  const [front, back] = yokeRepeatSides(12);
  assert.deepEqual(
    front.repeats.map(({ section }) => section),
    [3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(
    back.repeats.map(({ section }) => section),
    [9, 10, 11, 0, 1, 2],
  );
  assert.equal(yokeRepeatList([1, 3, 4, 5, 8], 12), "1–3, 6, 11");
  for (let count = 2; count <= 40; count++) {
    const groups = yokeRepeatSides(count);
    const all = groups.flatMap(({ repeats }) => repeats);
    assert.equal(new Set(all.map(({ section }) => section)).size, count);
    for (const { section, number } of all)
      assert.equal(yokeRepeatNumber(section, count), number);
  }
});

test("a shared M1 bar names both front-first repeat labels at the seam", () => {
  const counts = Array<number>(12).fill(2);
  const steps = counts.map((_, section): YokeOperation[] => [
    { id: `${section}-a`, action: "knit", color: 0 },
    { id: `${section}-b`, action: "knit", color: 0 },
  ]);
  steps[2].push({ id: "before-seam", action: "m1l", color: 0 });
  steps[3].unshift({ id: "after-seam", action: "m1r", color: 0 });
  assert.throws(
    () => resolveYokeRound(yokeSeedLoops(counts), steps, 9),
    /Round 10: two M1s cannot use the same bar between repeats 12 and 1/,
  );
});
