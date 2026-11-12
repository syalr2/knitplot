import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultYokeMeasurements as measurements,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "./yoke-plan";
import { createYokeProject } from "./yoke-project";
import {
  yokeDocument,
  reshapeYoke,
  regaugeYoke,
  yokeTransferCounts,
} from "./yoke-document";
import { readChartDocument } from "./chart-schema";
import { cloneDocument } from "./chart";
import { readProject } from "./project-file";
import { newChartTab, readWorkspace, workspaceSave } from "./workspace";
const project = createYokeProject(
  measurements,
  suggestYokeSchedule(calculateYokeTargets(measurements), measurements.repeats),
);

test("complete yokes survive normal project files, workspace and independent undo copies", () => {
  const document = yokeDocument(project, "My yoke");
  const opened = readProject(
    JSON.parse(
      JSON.stringify({ format: "colorwork-chart", version: 2, document }),
    ),
  );
  assert.deepEqual(opened.yoke, project);
  const workspace = readWorkspace(
    workspaceSave([newChartTab(document, "test")], "test"),
  ).workspace;
  assert.deepEqual(workspace.tabs[0].document.yoke, project);
  const copy = cloneDocument(document);
  copy.yoke!.cells[0][0] = 2;
  assert.equal(project.cells[0][0], 0);
  assert.throws(() =>
    readChartDocument({ ...document, width: document.width + 1 }),
  );
  assert.throws(() =>
    readChartDocument({ ...document, yoke: { ...project, cells: [] } }),
  );
});

test("gauge changes preserve all stitch counts, turns, symbols and yarn", () => {
  const next = regaugeYoke(project, {
    gaugeStitches: 22,
    gaugeRows: 32,
    gaugeMeasure: 10,
  });
  assert.deepEqual(next.cells, project.cells);
  assert.deepEqual(next.events, project.events);
  const old = calculateYokeTargets(project.measurements),
    target = calculateYokeTargets(next.measurements);
  for (const key of [
    "neck",
    "end",
    "rounds",
    "shortRowPairs",
    "underarm",
  ] as const)
    assert.equal(target[key], old[key]);
  assert.ok(target.actualNeck < old.actualNeck);
  assert.doesNotThrow(() => readChartDocument(yokeDocument(next)));
});

test("reshaping transfers yarn per repeat without changing the original", () => {
  const source = structuredClone(project);
  source.cells = source.cells.map((row) =>
    row.map(
      (_, c) => (Math.floor(c / (row.length / measurements.repeats)) % 2) + 1,
    ),
  );
  const snapshot = JSON.stringify(source);
  const nextMeasurements = { ...measurements, depth: 25, chest: 110 };
  const nextEvents = suggestYokeSchedule(
    calculateYokeTargets(nextMeasurements),
    nextMeasurements.repeats,
  );
  for (const mode of ["keep", "scale"] as const) {
    const next = reshapeYoke(source, nextMeasurements, nextEvents, mode);
    const w = next.cells[0].length / measurements.repeats;
    assert.equal(next.cells[0][Math.floor(w / 2)], 1);
    assert.equal(next.cells[0][w + Math.floor(w / 2)], 2);
    assert.doesNotThrow(() => readChartDocument(yokeDocument(next)));
    assert.equal(JSON.stringify(source), snapshot);
    const transfer = yokeTransferCounts(source, next);
    const oldCount = source.cells.flat().length;
    const newCount = next.cells.flat().length;
    assert.equal(newCount - transfer.added, oldCount - transfer.cropped);
    assert.ok(transfer.cropped >= 0 && transfer.added >= 0);
  }
});
