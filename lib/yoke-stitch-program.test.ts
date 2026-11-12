import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveYokeProgram,
  type YokeStitchProgram,
} from "./yoke-stitch-program";
import { reviseYokeStitches } from "./yoke-stitch-revision";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { createYokeProject } from "./yoke-project";
import {
  defaultYokeMeasurements as measurements,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "./yoke-plan";
import type { StitchAction } from "./chart";

const plain = (): YokeStitchProgram => ({
  revision: 0,
  startingCounts: [6, 6],
  rounds: Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 2 }, (_, s) =>
      Array.from({ length: 6 }, (_, c) => ({
        id: `base-${r}-${s}-${c}`,
        action: "knit",
        color: c % 3,
      })),
    ),
  ),
});
const counts = (program: YokeStitchProgram) =>
  resolveYokeProgram(program).map((round) =>
    round.sections.map((section) => section.length),
  );

for (const [action, expected] of [
  ["m1l", 7],
  ["m1r", 7],
  ["cast-on", 7],
  ["kfb", 7],
  ["inc", 7],
  ["ssk", 5],
  ["k2tog", 5],
  ["dec", 5],
  ["cdd", 4],
  ["bind-off", 5],
  ["purl", 6],
  ["no-stitch", 6],
] as const)
  test(`${action}: recalculate just one repeat, preserve other repeats and propagate the new count`, () => {
    const source = plain(),
      snapshot = JSON.stringify(source);
    const next = reviseYokeStitches(source, [
      { round: 1, section: 0, operation: "base-1-0-2", action },
    ]);
    assert.deepEqual(counts(next), [
      [6, 6],
      [expected, 6],
      [expected, 6],
      [expected, 6],
      [expected, 6],
    ]);
    assert.equal(JSON.stringify(source), snapshot);
    const before = resolveYokeProgram(source),
      after = resolveYokeProgram(next);
    for (let r = 0; r < after.length; r++)
      assert.deepEqual(after[r].sections[1], before[r].sections[1]);
    assert.ok(after[1].operations[0].some((op) => op.action === action));
  });

test("planned yokes convert without changing any output colour, stitch count or increase direction", () => {
  const project = createYokeProject(
    measurements,
    suggestYokeSchedule(
      calculateYokeTargets(measurements),
      measurements.repeats,
    ),
  );
  project.events[0].stitch = "m1r";
  project.cells = project.cells.map((row, r) => row.map((_, c) => (r + c) % 3));
  const program = yokeProgramFromProject(project),
    resolved = resolveYokeProgram(program);
  resolved.forEach((round, r) =>
    assert.deepEqual(
      round.sections.flat().map((loop) => loop.color),
      project.cells[r],
    ),
  );
  assert.ok(
    resolved[project.events[0].round - 1].operations
      .flat()
      .some((op) => op.action === "m1r"),
  );
});

test("all-repeat editing uses one explicit target per repeat", () => {
  const source = plain();
  const next = reviseYokeStitches(
    source,
    [0, 1].map((section) => ({
      round: 1,
      section,
      operation: `base-1-${section}-2`,
      action: "m1l",
    })),
  );
  assert.deepEqual(counts(next), [
    [6, 6],
    [7, 7],
    [7, 7],
    [7, 7],
    [7, 7],
  ]);
});

test("removing a new increase removes its descendants, not neighbouring colour columns", () => {
  const source = plain();
  const increased = reviseYokeStitches(source, [
    { round: 1, section: 0, operation: "base-1-0-2", action: "m1l" },
  ]);
  const newOp = increased.rounds[1][0].find((op) => op.action === "m1l")!;
  const restored = reviseYokeStitches(increased, [
    { round: 1, section: 0, operation: newOp.id, action: "knit" },
  ]);
  assert.deepEqual(counts(restored), counts(source));
  const a = resolveYokeProgram(source),
    b = resolveYokeProgram(restored);
  a.forEach((round, r) =>
    assert.deepEqual(
      b[r].sections.map((row) => row.map((loop) => loop.color)),
      round.sections.map((row) => row.map((loop) => loop.color)),
    ),
  );
});

test("revisions can be made repeatedly without colliding IDs", () => {
  let current = plain();
  for (let n = 0; n < 12; n++) {
    const section = n % 2,
      op = current.rounds[1][section].find((op) => op.action === "knit")!;
    current = reviseYokeStitches(current, [
      {
        round: 1,
        section,
        operation: op.id,
        action: n % 3 === 0 ? "purl" : "kfb",
      },
    ]);
    assert.doesNotThrow(() => resolveYokeProgram(current));
  }
});

test("insufficient inputs and ambiguous shaping overlaps are refused, preserving the source", () => {
  const source = plain(),
    snapshot = JSON.stringify(source);
  assert.throws(
    () =>
      reviseYokeStitches(source, [
        { round: 1, section: 0, operation: "base-1-0-5", action: "cdd" },
      ]),
    /edge|overlaps/,
  );
  const shaped = reviseYokeStitches(source, [
    { round: 2, section: 0, operation: "base-2-0-2", action: "ssk" },
  ]);
  assert.throws(
    () =>
      reviseYokeStitches(shaped, [
        { round: 1, section: 0, operation: "base-1-0-3", action: "bind-off" },
      ]),
    /input|different stitches/,
  );
  assert.equal(JSON.stringify(source), snapshot);
});

test("strict count checking rejects missing work, duplicate IDs, invalid actions and oversized yokes", () => {
  const source = plain();
  const missing = structuredClone(source);
  missing.rounds[0][0].pop();
  assert.throws(() => resolveYokeProgram(missing), /no instruction/);
  const duplicate = structuredClone(source);
  duplicate.rounds[0][1][0].id = duplicate.rounds[0][0][0].id;
  assert.throws(() => resolveYokeProgram(duplicate), /repeated/);
  const invalid = structuredClone(source);
  invalid.rounds[0][0][0].action = "fake" as StitchAction;
  assert.throws(() => resolveYokeProgram(invalid), /Invalid/);
  const oversized = structuredClone(source);
  oversized.startingCounts = [201, 6];
  assert.throws(() => resolveYokeProgram(oversized), /starting/);
});
