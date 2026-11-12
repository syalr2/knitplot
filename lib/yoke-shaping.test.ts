import { test } from "node:test";
import assert from "node:assert/strict";
import { shapingSchedule } from "./yoke-shaping";
import {
  defaultYokeMeasurements as defaults,
  calculateYokeTargets,
  convertYokeUnits,
  suggestYokeSchedule,
  yokeRoundCounts,
} from "./yoke-plan";

test("automatic base groups growth into bounded percentage increases, not one event per stitch", () => {
  for (const gaugeStitches of [12, 20, 28]) {
    const measurements = { ...defaults, gaugeStitches };
    const plan = calculateYokeTargets(measurements);
    const events = suggestYokeSchedule(plan, measurements.repeats);
    const counts = yokeRoundCounts(plan, measurements.repeats, events);
    assert.equal(counts[0], plan.neck);
    assert.equal(counts.at(-1), plan.end);
    let previous = plan.neck;
    for (const event of events) {
      assert.ok(
        event.count - previous <=
          Math.max(measurements.repeats, previous * 0.25),
      );
      previous = event.count;
    }
    assert.ok(events.length < (plan.end - plan.neck) / measurements.repeats);
    assert.ok(events.at(-1)!.round < plan.rounds);
  }
});

test("published-reference targets get smaller bands without a token final increase", () => {
  const boreal = shapingSchedule({ neck: 108, end: 320, rounds: 59 }, 4);
  assert.equal(boreal.length, 6);
  const idun = shapingSchedule({ neck: 122, end: 262, rounds: 49 }, 2);
  assert.equal(idun.length, 5);
  assert.ok(idun.at(-1)!.count - idun.at(-2)!.count >= 10);
});

test("an optional shoulder checkpoint constrains automatic counts and converts with units", () => {
  const measurements = {
    ...defaults,
    shoulderCircumference: 120,
    shoulderLength: 9,
  };
  const plan = calculateYokeTargets(measurements);
  assert.equal(plan.shoulder?.round, 26);
  assert.equal(plan.shoulder?.count, 240);
  const events = suggestYokeSchedule(plan, measurements.repeats);
  const counts = yokeRoundCounts(plan, measurements.repeats, events);
  assert.equal(counts[plan.shoulder!.round - 1], plan.shoulder!.count);
  const inches = convertYokeUnits(measurements, "in");
  const converted = calculateYokeTargets(inches);
  assert.equal(converted.shoulder?.count, plan.shoulder?.count);
  assert.equal(converted.shoulder?.round, plan.shoulder?.round);
  assert.deepEqual(
    suggestYokeSchedule(converted, measurements.repeats),
    events,
  );
  for (const requested of [4, 8, 12]) {
    const grouped = suggestYokeSchedule(plan, measurements.repeats, requested);
    assert.equal(grouped.length, requested);
    const groupedCounts = yokeRoundCounts(plan, measurements.repeats, grouped);
    assert.equal(groupedCounts[plan.shoulder!.round - 1], plan.shoulder!.count);
  }
});

test("automatic schedules remain viable at short lengths, high growth and maximum counts", () => {
  for (const neck of [2, 3, 7, 15, 30])
    for (const end of [31, 50, 100, 200])
      for (const rounds of [5, 12, 60, 150]) {
        if (end <= neck || Math.ceil(Math.log2(end / neck)) > rounds - 1)
          continue;
        const plan = { neck: neck * 4, end: end * 4, rounds };
        const events = shapingSchedule(plan, 4);
        let before = plan.neck,
          previousRound = 1;
        for (const event of events) {
          assert.ok(event.round > previousRound && event.round <= rounds);
          assert.ok(event.count > before && event.count <= before * 2);
          assert.equal(event.count % 4, 0);
          before = event.count;
          previousRound = event.round;
        }
        assert.equal(before, plan.end);
      }
});

test("incomplete or impossible shoulder checkpoints are refused", () => {
  for (const extra of [
    { shoulderCircumference: 120 },
    { shoulderLength: 9 },
    { shoulderCircumference: 30, shoulderLength: 9 },
    { shoulderCircumference: 200, shoulderLength: 9 },
    { shoulderCircumference: 120, shoulderLength: 24 },
    { shoulderCircumference: 120, shoulderLength: 0.1 },
  ])
    assert.throws(() => calculateYokeTargets({ ...defaults, ...extra }));
});

test("manual grouping is optional, retains the endpoints and favours earlier shaping", () => {
  const plan = calculateYokeTargets(defaults);
  for (const requested of [4, 8, 12]) {
    const events = suggestYokeSchedule(plan, defaults.repeats, requested);
    assert.equal(events.length, requested);
    assert.equal(
      yokeRoundCounts(plan, defaults.repeats, events).at(-1),
      plan.end,
    );
    const gaps = events
      .slice(1)
      .map((event, i) => event.round - events[i].round);
    assert.ok(gaps.at(-1)! >= gaps[0]);
  }
});
