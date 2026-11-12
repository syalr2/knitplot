import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultYokeMeasurements as measurements,
  calculateYokeTargets,
  suggestYokeSchedule,
  suggestIncreasePositions,
  increasePositions,
  parseIncreasePositions,
  yokeRoundCounts,
} from "./yoke-plan";
import {
  createYokeProject,
  paintYoke,
  yokeProjectSchema,
  serializeYokeProject,
} from "./yoke-project";
import { yokeChart, yokeChartCell } from "./yoke-chart";
import { readChartDocument } from "./chart-schema";
import { rowStitchMath } from "./chart";
import { yokeGeometry, yokeCellAt } from "./yoke-layout";

test("schedule count is a choice: four and eight both reach the same targets", () => {
  const plan = calculateYokeTargets(measurements);
  for (const rounds of [4, 8, 12]) {
    const events = suggestYokeSchedule(plan, measurements.repeats, rounds);
    assert.equal(events.length, rounds);
    const counts = yokeRoundCounts(plan, measurements.repeats, events);
    assert.equal(counts.at(-1), plan.end);
  }
});
test("suggested M1 slots exactly account for growth and leave an existing stitch between increases", () => {
  for (let before = 2; before <= 50; before++)
    for (let added = 1; added <= before; added++) {
      const after = before + added;
      const placements = suggestIncreasePositions(before, after);
      assert.equal(placements.length, added);
      assert.doesNotThrow(() =>
        increasePositions(
          { round: 2, count: after * 12, placements },
          before,
          12,
        ),
      );
    }
  assert.throws(
    () =>
      increasePositions({ round: 2, count: 7 * 12, placements: [1, 2] }, 5, 12),
    /separated/,
  );
  assert.throws(
    () =>
      increasePositions({ round: 2, count: 7 * 12, placements: [0, 6] }, 5, 12),
    /separated/,
  );
});
test("regular chart preserves every yarn cell and the correct increase/no-stitch counts", () => {
  const plan = calculateYokeTargets(measurements);
  const project = createYokeProject(
    measurements,
    suggestYokeSchedule(plan, measurements.repeats, 8),
  );
  project.events[0].stitch = "m1r";
  const painted = paintYoke(project, 2, 1, 2, true);
  const before = JSON.stringify(painted);
  const { document, maps } = yokeChart(painted);
  assert.doesNotThrow(() => readChartDocument(document));
  assert.equal(document.width, plan.end / measurements.repeats);
  for (let row = 0; row < painted.cells.length; row++) {
    const chartRow = document.height - 1 - row;
    const active = painted.cells[row].length / measurements.repeats;
    assert.equal(maps[row].length, active);
    for (let stitch = 0; stitch < active; stitch++) {
      const column = maps[row][stitch];
      assert.equal(
        document.cells[chartRow][column],
        `yarn-${painted.cells[row][stitch]}`,
      );
      assert.deepEqual(yokeChartCell(painted, chartRow, column), {
        row,
        column: stitch,
      });
    }
    const symbols = document.stitchActions![chartRow];
    assert.equal(
      symbols.filter((action) => action === "no-stitch").length,
      document.width - active,
    );
    const previous = row
      ? painted.cells[row - 1].length / measurements.repeats
      : active;
    assert.equal(
      symbols.filter((action) => action === "m1l" || action === "m1r").length,
      active - previous,
    );
    const math = rowStitchMath(document, row + 1);
    assert.equal(math.endingStitches, active);
    if (row) assert.equal(math.startingStitches, previous);
  }
  assert.equal(JSON.stringify(painted), before);
});
test("changing M1 placement reassigns placeholder columns, without touching painted data", () => {
  const project = createYokeProject(
    measurements,
    suggestYokeSchedule(
      calculateYokeTargets(measurements),
      measurements.repeats,
      8,
    ),
  );
  const event = project.events[0];
  const count = event.count / measurements.repeats;
  const added =
    count - project.cells[event.round - 2].length / measurements.repeats;
  const positions = Array.from({ length: added }, (_, index) => index * 2);
  const modified = {
    ...project,
    events: project.events.map((entry, index) =>
      index ? entry : { ...entry, placements: positions },
    ),
  };
  assert.equal(yokeProjectSchema.safeParse(modified).success, true);
  assert.notDeepEqual(
    yokeChart(project).maps[event.round - 2],
    yokeChart(modified).maps[event.round - 2],
  );
  assert.equal(project.cells, modified.cells);
});
test("half views select the front or back half of the original rows, wrapping at the round seam", () => {
  const counts = [84, 96, 144];
  for (const view of ["front", "back"] as const) {
    const geometry = yokeGeometry(counts, 12, view, 1.4);
    assert.equal(geometry.arc, Math.PI);
    for (let row = 0; row < counts.length; row++)
      for (let cell = 0; cell < geometry.shownCounts[row]; cell++) {
        const angle =
          geometry.startAngle +
          ((cell + 0.5) / geometry.shownCounts[row]) * geometry.arc;
        const radius = geometry.inner + (row + 0.5) * geometry.radialHeight;
        assert.deepEqual(
          yokeCellAt(
            counts,
            12,
            view,
            1.4,
            geometry.cx + Math.cos(angle) * radius,
            geometry.cy + Math.sin(angle) * radius,
          ),
          { row, column: (geometry.columnOffsets[row] + cell) % counts[row] },
        );
      }
  }
});

test("individual increase directions survive parsing, validation and chart rendering", () => {
  assert.deepEqual(parseIncreasePositions("7R, 3L", "m1l"), {
    placements: [2, 6],
    directions: ["m1l", "m1r"],
  });
  assert.throws(
    () => parseIncreasePositions("3, nonsense", "m1l"),
    /Enter positions/,
  );
  const project = createYokeProject(
    measurements,
    suggestYokeSchedule(
      calculateYokeTargets(measurements),
      measurements.repeats,
      4,
    ),
  );
  const event = project.events.find((entry) => entry.placements!.length >= 2)!;
  event.directions = event.placements!.map((_, index) =>
    index % 2 ? "m1r" : "m1l",
  );
  assert.equal(yokeProjectSchema.safeParse(project).success, true);
  const chart = yokeChart(project);
  const chartRow = project.cells.length - event.round;
  event.placements!.forEach((slot, index) =>
    assert.equal(
      chart.document.stitchActions![chartRow][
        chart.maps[event.round - 1][slot]
      ],
      event.directions![index],
    ),
  );
});

test("equivalent yoke drafts serialize identically despite property insertion order", () => {
  const original = createYokeProject(
    measurements,
    suggestYokeSchedule(
      calculateYokeTargets(measurements),
      measurements.repeats,
      8,
    ),
  );
  const reordered = {
    ...original,
    events: original.events.map((event) => ({
      placements: event.placements,
      stitch: event.stitch,
      count: event.count,
      round: event.round,
    })),
  };
  assert.equal(serializeYokeProject(original), serializeYokeProject(reordered));
});
