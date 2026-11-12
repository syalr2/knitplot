import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultYokeMeasurements,
  calculateYokeTargets,
  convertYokeUnits,
} from "./yoke-plan";
import { yokeRoundingReview } from "./yoke-rounding";

const wide = {
  ...defaultYokeMeasurements,
  neck: 50,
  chest: 150,
  bodyEase: 12,
  upperArm: 48,
  sleeveEase: 4,
  underarm: 6,
  depth: 28,
  gaugeStitches: 14,
  gaugeRows: 20,
  repeats: 16,
};
test("large repeat-rounding changes are explicit, with valid alternatives and no input mutation", () => {
  const before = JSON.stringify(wide);
  const review = yokeRoundingReview(wide, calculateYokeTargets(wide));
  assert.equal(review.changes[0].name, "Neck opening");
  assert.ok(review.changes[0].percent < -8);
  assert.equal(review.alternatives[0].repeats, 14);
  assert.equal(review.alternatives[0].neck, 50);
  assert.equal(JSON.stringify(wide), before);
  const inches = convertYokeUnits(wide, "in");
  const converted = yokeRoundingReview(inches, calculateYokeTargets(inches));
  assert.equal(converted.changes.length, review.changes.length);
  assert.ok(
    Math.abs(converted.changes[0].percent - review.changes[0].percent) < 1e-8,
  );
  assert.equal(converted.alternatives[0].repeats, 14);
});
test("small rounding differences do not demand approval", () => {
  assert.equal(
    yokeRoundingReview(
      defaultYokeMeasurements,
      calculateYokeTargets(defaultYokeMeasurements),
    ).changes.length,
    0,
  );
});
