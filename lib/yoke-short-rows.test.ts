import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultYokeMeasurements as defaults,
  convertYokeUnits,
} from "./yoke-plan";
import { planYokeShortRows } from "./yoke-short-rows";
import {
  createYokeProject,
  serializeYokeProject,
  yokeProjectSchema,
} from "./yoke-project";
import { calculateYokeTargets, suggestYokeSchedule } from "./yoke-plan";

test("short-row turns are symmetric, widen beyond previous turns and preserve front stitches", () => {
  const plan = planYokeShortRows(defaults);
  assert.equal(plan.neck, 84);
  assert.deepEqual(plan.distances, [25, 30, 34]);
  assert.equal(plan.extraRows, 6);
  assert.equal(plan.frontUntouched, 16);
  assert.deepEqual(
    plan.rows.map((row) => row.work),
    [25, 49, 54, 59, 63, 67],
  );
  assert.equal(plan.returnToCentre, 33);
});

test("German double stitches are slipped, not counted again in the following work count", () => {
  for (const distances of [[15], [15, 18], [10, 15, 21], [21, 15, 10]]) {
    const plan = planYokeShortRows(
      { ...defaults, backRise: (distances.length * 2) / 2.8 },
      { distances },
    );
    // Simulate the needle, counting a slipped DS as one existing stitch.
    let position = 0;
    const worked = new Map<number, number>();
    for (const row of plan.rows) {
      const direction = row.side === "RS" ? 1 : -1;
      if (row.number > 1) position += direction; // slip last worked stitch to make DS
      for (let i = 0; i < row.work; i++) {
        const stitch = direction === 1 ? position : position - 1;
        worked.set(stitch, (worked.get(stitch) ?? 0) + 1);
        position += direction;
      }
      assert.equal(position, row.side === "RS" ? row.distance : -row.distance);
    }
    position++; // make last DS, return towards centre back
    for (let i = 0; i < plan.returnToCentre; i++) {
      worked.set(position, (worked.get(position) ?? 0) + 1);
      position++;
    }
    assert.equal(position, 0);
    assert.equal(worked.get(0), distances.length * 2);
    assert.equal(worked.get(-1), distances.length * 2);
  }
});

test("short rows can be omitted, survive unit conversion and reject impossible spans", () => {
  assert.deepEqual(
    planYokeShortRows({ ...defaults, backRise: 0 }).distances,
    [],
  );
  assert.deepEqual(
    planYokeShortRows(convertYokeUnits(defaults, "in")).distances,
    planYokeShortRows(defaults).distances,
  );
  for (const distances of [
    [21, 25],
    [21, 21, 28],
    [21, 22, 28],
    [21, 25, 42],
    [1, 20, 28],
    [NaN, 25, 28],
  ]) {
    assert.throws(() => planYokeShortRows(defaults, { distances }));
  }
  assert.throws(() =>
    planYokeShortRows({ ...defaults, backRise: 15, gaugeRows: 100, depth: 10 }),
  );
});

test("saved custom turns roundtrip and legacy projects remain unchanged", () => {
  const project = createYokeProject(
    defaults,
    suggestYokeSchedule(calculateYokeTargets(defaults), defaults.repeats),
  );
  assert.equal("shortRows" in JSON.parse(serializeYokeProject(project)), false);
  const saved = { ...project, shortRows: { distances: [18, 22, 26] } };
  assert.deepEqual(
    yokeProjectSchema.parse(JSON.parse(serializeYokeProject(saved))),
    saved,
  );
  assert.equal(
    yokeProjectSchema.safeParse({
      ...saved,
      shortRows: { distances: [18, 18, 26] },
    }).success,
    false,
  );
  assert.deepEqual(project.cells, saved.cells);
});

test("default turns remain bounded and ordered across sizes and gauges", () => {
  let checked = 0;
  for (const gaugeStitches of [12, 20, 28])
    for (const gaugeRows of [18, 28, 36])
      for (const backRise of [0, 1, 2, 3]) {
        const measurements = {
          ...defaults,
          gaugeStitches,
          gaugeRows,
          backRise,
        };
        let plan;
        try {
          plan = planYokeShortRows(measurements);
        } catch {
          const pairs = calculateYokeTargets(measurements).shortRowPairs;
          plan = planYokeShortRows(measurements, {
            distances: Array.from({ length: pairs }, (_, i) => 2 + 3 * i),
          });
        }
        assert.ok(plan.frontUntouched > 0);
        assert.equal(plan.rows.length, plan.distances.length * 2);
        assert.ok(
          plan.distances.every(
            (distance, i) =>
              distance <= plan.maxDistance &&
              distance >= 2 &&
              (i === 0 || distance - plan.distances[i - 1] >= 2),
          ),
        );
        checked++;
      }
  assert.equal(checked, 36);
});

test("narrowing custom turns persist, but mixed directions and repeated turns do not", () => {
  const setup = { distances: [34, 30, 25] };
  const plan = planYokeShortRows(defaults, setup);
  assert.equal(plan.direction, "narrowing");
  assert.equal(plan.frontUntouched, 16);
  const project = createYokeProject(
    defaults,
    suggestYokeSchedule(calculateYokeTargets(defaults), defaults.repeats),
  );
  assert.deepEqual(
    yokeProjectSchema.parse({ ...project, shortRows: setup }).shortRows,
    setup,
  );
  assert.throws(() => planYokeShortRows(defaults, { distances: [25, 30, 28] }));
  assert.throws(() => planYokeShortRows(defaults, { distances: [30, 30, 25] }));
});
