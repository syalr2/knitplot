import assert from "node:assert/strict";
import { test } from "node:test";
import { readChartDocument } from "./chart-schema";
import { tutorialExampleDocument } from "./tutorial-examples";
import { yokeDocument } from "./yoke-document";
import { prepareYokeIncreaseMove } from "./yoke-move-increase";
import { yokeChart } from "./yoke-chart";
import { mirrorYokeRepeat } from "./yoke-repeat-mirror";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";
import { reviseYokeStitches } from "./yoke-stitch-revision";

const original = tutorialExampleDocument("tidal-fish-yoke")!.document;
const source = { row: 16, column: 5 };

function projectWithPurl(row: number, column: number) {
  const base = original.yoke!;
  const program = yokeProgramFromProject(base);
  const project = withYokeProgram(base, program);
  const round = base.cells.length - 1 - row;
  const chart = yokeChart(project, 0);
  if (!("operationMaps" in chart))
    throw new Error("Expected a stitch program.");
  const operation = chart.operationMaps![round].get(column)!;
  return withYokeProgram(
    project,
    reviseYokeStitches(program, [
      { round, section: 0, operation, action: "purl" },
    ]),
  );
}

test("a sideways move carries a displaced purl to the newly live cell", () => {
  const project = projectWithPurl(17, 2);
  const before = yokeChart(project).document;
  const next = prepareYokeIncreaseMove(
    project,
    0,
    false,
    source,
  )({ row: 16, column: 2 });
  const after = readChartDocument(yokeDocument(next));
  assert.equal(before.stitchActions![17][2], "purl");
  assert.equal(before.stitchActions![17][5], "no-stitch");
  assert.equal(after.stitchActions![17][2], "no-stitch");
  assert.equal(after.stitchActions![17][5], "purl");
  assert.equal(after.cells[17][5], before.cells[17][2]);
});

test("a move that would replace a purl at its destination is rejected", () => {
  const project = projectWithPurl(16, 2);
  assert.throws(
    () =>
      prepareYokeIncreaseMove(
        project,
        0,
        false,
        source,
      )({ row: 16, column: 2 }),
    /this move would remove a purl/,
  );
  assert.equal(yokeChart(project).document.stitchActions![16][2], "purl");
});

for (const [label, target] of [
  ["toward the hem", { row: 15, column: 5 }],
  ["toward the neck", { row: 17, column: 5 }],
  ["sideways", { row: 16, column: 2 }],
] as const) {
  test(`moving an increase ${label} rebuilds the no-stitch columns`, () => {
    const project = prepareYokeIncreaseMove(
      original.yoke!,
      0,
      true,
      source,
    )(target);
    const next = readChartDocument(yokeDocument(project));
    assert.equal(next.stitchActions![target.row][target.column], "m1l");
    assert.equal(
      next.stitchActions![target.row + 1][target.column],
      "no-stitch",
    );
    assert.notEqual(next.stitchActions![source.row][source.column], "m1l");
    assert.equal(original.stitchActions![source.row][source.column], "m1l");
    assert.equal(project.cells[0].length, original.yoke!.cells[0].length);
    assert.deepEqual(project.cells.at(-1), original.yoke!.cells.at(-1));
    assert.equal(next.cells[0][20], original.cells[0][20]);
  });
}

test("unsafe and out-of-bounds drops cannot change the plan", () => {
  const project = original.yoke!;
  const before = structuredClone(project);
  const move = prepareYokeIncreaseMove(project, 0, true, source);
  assert.throws(() => move({ row: 61, column: 5 }), /first round/);
  assert.throws(() => move({ row: 16, column: 6 }), /already has an increase/);
  assert.strictEqual(move(source), project);
  assert.deepEqual(project, before);
});

test("moving in a selected group leaves other repeats untouched, including when mirrored", () => {
  const project = mirrorYokeRepeat(original.yoke!, [1, 2]);
  const target = { row: 15, column: 5 };
  const next = prepareYokeIncreaseMove(project, 0, [0, 1], source)(target);
  assert.equal(yokeChart(next, 0).document.stitchActions![15][5], "m1l");
  assert.equal(yokeChart(next, 1).document.stitchActions![15][35], "m1r");
  assert.deepEqual(yokeChart(next, 2).document, yokeChart(project, 2).document);
  assert.deepEqual(yokeChart(next, 3).document, yokeChart(project, 3).document);
  readChartDocument(yokeDocument(next));
});
