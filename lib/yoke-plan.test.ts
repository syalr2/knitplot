import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateYokeTargets,
  defaultYokeMeasurements as defaults,
  convertYokeUnits,
  suggestYokeSchedule,
  yokeRoundCounts,
} from "./yoke-plan";
import {
  createYokeProject,
  paintYoke,
  yokeProjectSchema,
} from "./yoke-project";
import { yokeGeometry, yokeCellAt, type YokeView } from "./yoke-layout";

const plan = calculateYokeTargets(defaults);
const events = suggestYokeSchedule(plan, defaults.repeats);
test("underarms are counted twice in the body and once in each sleeve", () => {
  const target = calculateYokeTargets({
    ...defaults,
    repeats: 2,
    chest: 100,
    bodyEase: 10,
  });
  assert.equal(target.body, 220);
  assert.equal(target.sleeve, 72);
  assert.equal(target.underarm, 8);
  assert.equal(target.end, 332);
  assert.equal(target.bodyFromYoke, 204);
  assert.equal(target.sleeveFromYoke, 64);
  assert.equal(target.bodyFromYoke + 2 * target.sleeveFromYoke, target.end);
  assert.equal(target.bodyFromYoke + 2 * target.underarm, target.body);
  assert.equal(target.sleeveFromYoke + target.underarm, target.sleeve);
});
test("repeat rounding exposes its effect on actual measurements", () => {
  assert.equal(plan.neck, 84);
  assert.equal(plan.neckAdjustment, -4);
  assert.equal(plan.actualNeck, 42);
  assert.equal(plan.end % defaults.repeats, 0);
  assert.equal(
    plan.actualBody,
    (plan.end - 2 * plan.sleeve + 4 * plan.underarm) / 2,
  );
});
test("unit conversion preserves stitch counts, full rounds and short-row allowance", () => {
  const inches = calculateYokeTargets(convertYokeUnits(defaults, "in"));
  for (const key of [
    "neck",
    "end",
    "body",
    "sleeve",
    "underarm",
    "rounds",
    "shortRowPairs",
  ] as const)
    assert.equal(inches[key], plan[key]);
  const roundtrip = convertYokeUnits(convertYokeUnits(defaults, "in"), "cm");
  assert.ok(Math.abs(roundtrip.neck - defaults.neck) < 1e-10);
});
test("short rows add local height, never full rounds or stitches", () => {
  const without = calculateYokeTargets({ ...defaults, backRise: 0 });
  assert.equal(without.rounds, plan.rounds);
  assert.equal(without.end, plan.end);
  assert.equal(without.shortRowPairs, 0);
  assert.equal(plan.shortRowPairs, 3);
  assert.equal(plan.actualBackRise, 6 / 2.8);
});
test("invalid geometry and impossible measurements are rejected before allocation", () => {
  for (const update of [
    { gaugeStitches: 0 },
    { gaugeRows: NaN },
    { depth: Infinity },
    { underarm: 40 },
    { repeats: 2.5 },
    { depth: 100 },
    { neck: 200 },
    { chest: -1 },
  ]) {
    assert.throws(() => calculateYokeTargets({ ...defaults, ...update }));
  }
});
test("suggested schedules are internally consistent across gauges, counts and repeat choices", () => {
  let checked = 0;
  for (const gaugeStitches of [12, 20, 28])
    for (const gaugeRows of [18, 28, 36])
      for (const repeats of [4, 8, 12, 20])
        for (const chest of [75, 100, 140]) {
          const measurements = {
            ...defaults,
            gaugeStitches,
            gaugeRows,
            repeats,
            chest,
          };
          const target = calculateYokeTargets(measurements);
          const counts = yokeRoundCounts(
            target,
            repeats,
            suggestYokeSchedule(target, repeats),
          );
          assert.equal(counts.length, target.rounds);
          assert.equal(counts[0], target.neck);
          assert.equal(counts.at(-1), target.end);
          assert.ok(
            counts.every(
              (count, index) =>
                count % repeats === 0 && (!index || count >= counts[index - 1]),
            ),
          );
          checked++;
        }
  assert.equal(checked, 108);
});
test("short five-round schedules retain unique increase rounds and viable counts", () => {
  const target = calculateYokeTargets({ ...defaults, depth: 1.8 });
  assert.equal(target.rounds, 5);
  assert.doesNotThrow(() =>
    yokeRoundCounts(
      target,
      defaults.repeats,
      suggestYokeSchedule(target, defaults.repeats),
    ),
  );
});
test("schedule validation rejects duplicate rounds, nonmultiples, missing targets and oversized jumps", () => {
  for (const schedule of [
    [...events, events[0]],
    [{ round: 2, count: plan.end - 1 }],
    [],
    [{ round: 2, count: plan.end }],
    [{ round: 151, count: plan.end }],
  ]) {
    assert.throws(() => yokeRoundCounts(plan, defaults.repeats, schedule));
  }
});
test("painting repeats preserves other rounds and supports independent variations", () => {
  const original = createYokeProject(defaults, events);
  const copy = JSON.stringify(original);
  const next = paintYoke(original, 0, 2, 1, true);
  const width = plan.neck / defaults.repeats;
  assert.equal(
    next.cells[0].filter((color) => color === 1).length,
    defaults.repeats,
  );
  assert.ok(
    next.cells[0].every(
      (color, column) => color === (column % width === 2 ? 1 : 0),
    ),
  );
  assert.equal(next.cells[1], original.cells[1]);
  assert.equal(JSON.stringify(original), copy);
  const one = paintYoke(original, 0, 2, 1, false);
  assert.equal(one.cells[0].filter((color) => color === 1).length, 1);
  assert.equal(paintYoke(one, -1, 0, 1, false), one);
  assert.equal(paintYoke(one, 0, 0, 99, false), one);
});
test("project validation rejects wrong cell counts and missing palette colours", () => {
  const project = createYokeProject(defaults, events);
  assert.equal(yokeProjectSchema.safeParse(project).success, true);
  assert.equal(
    yokeProjectSchema.safeParse({ ...project, version: 2 }).success,
    false,
  );
  assert.equal(
    yokeProjectSchema.safeParse({ ...project, cells: [] }).success,
    false,
  );
  assert.equal(
    yokeProjectSchema.safeParse({
      ...project,
      palette: ["#000000", "#ffffff"],
      cells: project.cells.map((row) => row.map(() => 2)),
    }).success,
    false,
  );
});
test("all drawing views hit exactly the cells they render, including outside boundaries", () => {
  const counts = yokeRoundCounts(plan, defaults.repeats, events);
  for (const view of ["whole", "repeat", "chart"] as YokeView[]) {
    const g = yokeGeometry(counts, defaults.repeats, view, 1.4);
    assert.equal(
      g.arc,
      view === "whole" ? 2 * Math.PI : (2 * Math.PI) / defaults.repeats,
    );
    for (const row of [0, 10, counts.length - 1])
      for (const column of [
        0,
        Math.floor(g.shownCounts[row] / 2),
        g.shownCounts[row] - 1,
      ]) {
        const angle =
          g.startAngle + ((column + 0.5) / g.shownCounts[row]) * g.arc;
        const radius = g.inner + (row + 0.5) * g.radialHeight;
        const x =
          view === "chart"
            ? (1000 - g.shownCounts[row] * g.cellWidth) / 2 +
              (column + 0.5) * g.cellWidth
            : g.cx + Math.cos(angle) * radius;
        const y =
          view === "chart"
            ? 760 - (row + 0.5) * g.rowHeight
            : g.cy + Math.sin(angle) * radius;
        assert.deepEqual(
          yokeCellAt(counts, defaults.repeats, view, 1.4, x, y),
          { row, column },
        );
      }
    assert.equal(
      yokeCellAt(counts, defaults.repeats, view, 1.4, -50, -50),
      null,
    );
  }
});
