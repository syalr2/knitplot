import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateYokeTargets,
  defaultYokeMeasurements,
  convertYokeUnits,
  suggestYokeSchedule,
} from "./yoke-plan";
import {
  finishedYokeSizes,
  switchYokeMeasurementMode,
} from "./yoke-measurement-mode";
import { createYokeProject, yokeProjectSchema } from "./yoke-project";

test("body plus ease and finished dimensions produce identical counts and schedules", () => {
  const finished = switchYokeMeasurementMode(
    defaultYokeMeasurements,
    "finished",
  );
  assert.equal(finished.chest, 106);
  assert.equal(finished.upperArm, 36);
  assert.deepEqual(
    calculateYokeTargets(finished),
    calculateYokeTargets(defaultYokeMeasurements),
  );
  assert.deepEqual(
    switchYokeMeasurementMode(finished, "body"),
    defaultYokeMeasurements,
  );
  assert.deepEqual(
    calculateYokeTargets(convertYokeUnits(finished, "in")).neck,
    calculateYokeTargets(finished).neck,
  );
});
test("edited finished sizes do not receive hidden ease a second time", () => {
  const finished = {
    ...switchYokeMeasurementMode(defaultYokeMeasurements, "finished"),
    chest: 120,
    upperArm: 40,
  };
  assert.deepEqual(finishedYokeSizes(finished), { body: 120, sleeve: 40 });
  const body = switchYokeMeasurementMode(finished, "body");
  assert.equal(body.chest, 110);
  assert.equal(body.bodyEase, 10);
  assert.deepEqual(calculateYokeTargets(body), calculateYokeTargets(finished));
});
test("new files retain input mode and old files default to body plus ease", () => {
  const body = createYokeProject(
    defaultYokeMeasurements,
    suggestYokeSchedule(calculateYokeTargets(defaultYokeMeasurements), 12),
  );
  const legacy = JSON.parse(JSON.stringify(body));
  delete legacy.measurements.measurementMode;
  assert.equal(
    yokeProjectSchema.parse(legacy).measurements.measurementMode,
    "body",
  );
  const finished = {
    ...body,
    measurements: switchYokeMeasurementMode(body.measurements, "finished"),
  };
  assert.equal(
    yokeProjectSchema.parse(JSON.parse(JSON.stringify(finished))).measurements
      .measurementMode,
    "finished",
  );
});

test("negative ease also survives measurement-mode and unit round trips", () => {
  const body = { ...defaultYokeMeasurements, bodyEase: -5, sleeveEase: -1 };
  const finished = switchYokeMeasurementMode(body, "finished");
  assert.deepEqual(calculateYokeTargets(body), calculateYokeTargets(finished));
  assert.deepEqual(switchYokeMeasurementMode(finished, "body"), body);
  const inches = convertYokeUnits(finished, "in");
  assert.equal(
    calculateYokeTargets(inches).body,
    calculateYokeTargets(body).body,
  );
});
