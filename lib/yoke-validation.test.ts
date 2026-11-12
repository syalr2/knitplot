import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateYokeTargets,
  defaultYokeMeasurements,
  suggestIncreasePositions,
} from "./yoke-plan";

test("the yoke planner still rejects more than 150 rounds", () => {
  assert.throws(
    () =>
      calculateYokeTargets({
        ...defaultYokeMeasurements,
        depth:
          (151 * defaultYokeMeasurements.gaugeMeasure) /
          defaultYokeMeasurements.gaugeRows,
      }),
    /150 full rounds/,
  );
});

test("repeat rounding cannot erase the body portion at the sleeve split", () => {
  assert.throws(
    () =>
      calculateYokeTargets({
        ...defaultYokeMeasurements,
        repeats: 40,
        underarm: 50,
        upperArm: 120,
        sleeveEase: 0,
      }),
    /body stitches/,
  );
});
test("incomplete schedule edits cannot allocate an unbounded positions array", () => {
  assert.throws(() => suggestIncreasePositions(10000, 15000));
  assert.throws(() => suggestIncreasePositions(150, 201));
  assert.equal(suggestIncreasePositions(150, 200).length, 50);
});
