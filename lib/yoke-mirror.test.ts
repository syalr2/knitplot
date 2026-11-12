import assert from "node:assert/strict";
import { test } from "node:test";
import { readChartDocument } from "./chart-schema";
import { yokeChart } from "./yoke-chart";
import { yokeDocument } from "./yoke-document";
import { yokeKnitModel } from "./yoke-knit";
import { mirrorStitchAction, mirrorYoke } from "./yoke-mirror";
import { stringifyKnitplot } from "./yoke-program-wire";
import { asymmetricYoke, mixedYoke } from "./yoke-test-fixtures";
import { mirrorYokeRepeat } from "./yoke-repeat-mirror";

test("single-repeat mirror keeps other repeats unchanged, including split stitch columns", () => {
  const { project } = mixedYoke;
  const mirrored = mirrorYokeRepeat(project, 0);
  const reopened = readChartDocument(
    JSON.parse(stringifyKnitplot(yokeDocument(mirrored))),
  ).yoke!;
  for (let section = 0; section < project.measurements.repeats; section++) {
    const old = yokeChart(project, section).document;
    const next = yokeChart(reopened, section).document;
    if (section === 0) {
      assert.deepEqual(
        next.cells,
        old.cells.map((row) => [...row].reverse()),
      );
      assert.deepEqual(
        next.stitchActions,
        old.stitchActions!.map((row) =>
          [...row].reverse().map(mirrorStitchAction),
        ),
      );
    } else assert.deepEqual(next, old);
  }
});

for (const { document, project } of [asymmetricYoke, mixedYoke]) {
  test(`mirror reflects every column and preserves round counts: ${document.name}`, () => {
    const flipped = mirrorYoke(project);
    const reopened = readChartDocument(
      JSON.parse(stringifyKnitplot(yokeDocument(flipped))),
    ).yoke!;
    const undone = mirrorYoke(reopened);
    const count = project.measurements.repeats;
    assert.deepEqual(
      reopened.cells,
      project.cells.map((row) => [...row].reverse()),
    );
    assert.deepEqual(reopened.shortRows, project.shortRows);
    for (const {
      startingStitches,
      endingStitches,
      change,
      lengths,
    } of yokeKnitModel(project).rounds)
      assert.ok(lengths.length && endingStitches === startingStitches + change);
    assert.deepEqual(
      yokeKnitModel(reopened).rounds.map(({ lengths, ...counts }) => ({
        ...counts,
        lengths: [...lengths].reverse(),
      })),
      yokeKnitModel(project).rounds,
    );
    for (let i = 0; i < count; i++) {
      const original = yokeChart(project, i).document;
      const mirrored = yokeChart(reopened, count - 1 - i).document;
      assert.deepEqual(
        mirrored.cells,
        original.cells.map((row) => [...row].reverse()),
      );
      assert.deepEqual(
        mirrored.stitchActions,
        original.stitchActions!.map((row) =>
          [...row].reverse().map(mirrorStitchAction),
        ),
      );
      assert.deepEqual(yokeChart(undone, i).document, original);
    }
  });
}
