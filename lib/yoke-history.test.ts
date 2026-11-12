import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDocument } from "./chart";
import { restoreYokeHistoryDocument } from "./yoke-history";
import { createYokeProject } from "./yoke-project";
import {
  defaultYokeMeasurements as m,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "./yoke-plan";
import { yokeDocument } from "./yoke-document";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";
import { readCloudChartPayload } from "./cloud-charts";
import { emptyHistory, remember, travelHistory } from "./history";

test("normal chart history is unchanged", () => {
  assert.equal(
    restoreYokeHistoryDocument(defaultDocument, defaultDocument),
    defaultDocument,
  );
});

test("undo restores legacy yoke stitches without downgrading the cloud format", () => {
  const project = createYokeProject(
    m,
    suggestYokeSchedule(calculateYokeTargets(m), m.repeats),
  );
  const original = yokeDocument(project, "Original");
  const untouched = JSON.stringify(original);
  const current = yokeDocument(
    withYokeProgram(project, yokeProgramFromProject(project)),
    "Changed",
  );
  const restored = restoreYokeHistoryDocument(current, original);
  assert.equal(restored.yoke?.version, 2);
  assert.equal(restored.name, original.name);
  assert.deepEqual(restored.yoke?.cells, original.yoke?.cells);
  assert.deepEqual(restored.stitchActions, original.stitchActions);
  assert.deepEqual(restored.instructions, original.instructions);
  assert.deepEqual(restored.guides, original.guides);
  assert.equal(
    readCloudChartPayload({ document: restored }).document.yoke?.version,
    2,
  );
  assert.equal(JSON.stringify(original), untouched);
  let history = remember(emptyHistory(), original);
  history = remember(history, { ...original, name: "Second" });
  const first = travelHistory(history, current, "undo");
  const firstDocument = restoreYokeHistoryDocument(current, first.document);
  const second = travelHistory(first.history, firstDocument, "undo");
  const secondDocument = restoreYokeHistoryDocument(
    firstDocument,
    second.document,
  );
  assert.equal(secondDocument.yoke?.version, 2);
  assert.equal(secondDocument.name, "Original");
  assert.deepEqual(secondDocument.yoke?.cells, project.cells);
  assert.equal(restoreYokeHistoryDocument(current, restored), restored);
});
