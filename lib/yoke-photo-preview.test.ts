import assert from "node:assert/strict";
import { test } from "node:test";
import {
  distanceFromPhotoCollar,
  fitsSweaterPhoto,
  photoCoursePosition,
  photoDetailWeight,
  photoSleeveWeight,
  photoStitchPitch,
} from "./yoke-photo-preview";
import { makeYokeFixture } from "./yoke-test-fixtures";
import { yokeDocument } from "./yoke-document";
import { createYokeProject } from "./yoke-project";
import {
  calculateYokeTargets,
  defaultYokeMeasurements,
  suggestYokeSchedule,
} from "./yoke-plan";

test("a deep but valid yoke is ineligible for the sweater preview", () => {
  const input = {
    ...defaultYokeMeasurements,
    depth: 90,
    gaugeRows: 14,
    backRise: 0,
  };
  const plan = calculateYokeTargets(input);
  const document = yokeDocument(
    createYokeProject(input, suggestYokeSchedule(plan, input.repeats)),
  );
  assert.equal(fitsSweaterPhoto(document), false);
  assert.equal(fitsSweaterPhoto(yokeDocument(makeYokeFixture())), true);
});

test("planner rejects gauge the chart document cannot store", () => {
  for (const key of ["gaugeStitches", "gaugeRows", "gaugeMeasure"]) {
    assert.throws(() =>
      calculateYokeTargets({ ...defaultYokeMeasurements, [key]: 101 }),
    );
  }
});

test("a sweater preview accepts 30% depth but not the next round beyond it", () => {
  for (const [gaugeStitches, gaugeRows, upperArm, underarm, repeats] of [
    [20, 30, 33, 4, 10],
    [8, 20, 30, 5, 8],
  ] as const) {
    for (const [depth, fits] of [
      [30, true],
      [30 + 10 / gaugeRows, false],
    ] as const) {
      const input = {
        ...defaultYokeMeasurements,
        measurementMode: "finished" as const,
        chest: 100,
        upperArm,
        underarm,
        repeats,
        gaugeStitches,
        gaugeRows,
        depth,
        backRise: 0,
      };
      const plan = calculateYokeTargets(input);
      assert.equal(plan.actualBody, 100);
      const project = createYokeProject(
        input,
        suggestYokeSchedule(plan, repeats),
      );
      assert.equal(fitsSweaterPhoto(yokeDocument(project)), fits);
    }
  }
});

test("three rounds have the same depth across the collar and shoulder", () => {
  const document = yokeDocument(makeYokeFixture());
  const { row } = photoStitchPitch(document);
  // Sample along the normals to a nearly horizontal and a sloped segment.
  for (const [x, y, dx, dy] of [
    [30, 150.5, 5, 60],
    [119, 127, 20, 38],
  ]) {
    const length = Math.hypot(dx, dy);
    for (const offset of [-0.25, 0.5, 1.5, 2.5, 3.1]) {
      const distance = distanceFromPhotoCollar(
        x + (dx * offset * row) / length,
        y + (dy * offset * row) / length,
      );
      assert.ok(Math.abs(distance / row - offset) < 0.001);
    }
  }
});

test("stitches turn outwards at the upper sleeve while the torso stays vertical", () => {
  for (const side of [-1, 1]) {
    assert.equal(photoSleeveWeight(side * 350, 290), 1);
    assert.equal(photoSleeveWeight(side * 250, 290), 0);
    assert.equal(photoSleeveWeight(side * 355, 650), 0);
    assert.equal(photoSleeveWeight(side * 550, 650), 1);
  }
});

test("the photo preserves the back-neck purls and only the cuff side of each seam", () => {
  assert.equal(photoDetailWeight(768, 90), 1);
  assert.equal(photoDetailWeight(768, 157), 0);
  for (const [x, seam] of [
    [102, 848],
    [153, 856],
    [1366, 861],
    [1416, 850],
  ]) {
    assert.equal(photoDetailWeight(x, seam - 1), 0);
    assert.equal(photoDetailWeight(x, seam + 2), 0.5);
    assert.equal(photoDetailWeight(x, seam + 5), 1);
  }
});

test("steeper shoulder stitches use less horizontal width for the same arc length", () => {
  // The last quarter of the projected width spans twice as much fabric.
  const arc = Float32Array.of(0, 10, 20, 30, 50);
  assert.equal(photoCoursePosition(0.5, arc), 0.4);
  assert.equal(photoCoursePosition(0.75, arc), 0.6);
  assert.equal(photoCoursePosition(0.875, arc), 0.8);
  assert.equal(photoCoursePosition(-0.875, arc), -0.8);
  assert.equal(photoCoursePosition(1, arc), 1);
});

test("halving stitch and row gauge doubles the mockup's knit texture pitch", () => {
  const chunky = photoStitchPitch(
    yokeDocument(
      makeYokeFixture({
        gaugeStitches: 14,
        gaugeRows: 20,
        repeats: 8,
        backRise: 0,
      }),
    ),
  );
  const fine = photoStitchPitch(
    yokeDocument(
      makeYokeFixture({
        gaugeStitches: 28,
        gaugeRows: 40,
        repeats: 8,
        backRise: 0,
      }),
    ),
  );
  assert.ok(Math.abs(chunky.stitch / fine.stitch - 2) < 0.02);
  assert.ok(Math.abs(chunky.row / fine.row - 2) < 0.02);
});
