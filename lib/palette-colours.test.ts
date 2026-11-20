import assert from "node:assert/strict";
import { test } from "node:test";
import { cloneDocument, defaultDocument } from "./chart";
import { nextPaletteColour } from "./palette-colours";
import { readProject } from "./project-file";
import { tutorialExampleDocument } from "./tutorial-examples";
import { yokeDocument } from "./yoke-document";
import { stringifyKnitplot } from "./yoke-program-wire";
import { paintYoke } from "./yoke-project";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";

const colours = Array.from(
  { length: 20 },
  (_, i) => `#${i.toString(16).padStart(6, "0")}`,
);
const file = (document: unknown) =>
  JSON.parse(
    stringifyKnitplot({ format: "colorwork-chart", version: 2, document }),
  );

test("added palette colours remain distinct up to the limit", () => {
  const added: string[] = [];
  for (let i = 0; i < 20; i++) added.push(nextPaletteColour(added));
  assert.equal(new Set(added).size, 20);
});

test("regular charts preserve colour 20 and reject an oversized palette", () => {
  const doc = cloneDocument(defaultDocument);
  doc.palette = colours.map((hex, i) => ({ id: `yarn-${i}`, hex }));
  doc.cells = doc.cells.map((row) => row.map(() => "yarn-19"));
  const restored = readProject(file(doc));
  assert.equal(restored.cells[0][0], "yarn-19");
  assert.equal(restored.palette[19].hex, colours[19]);
  doc.palette.push({ id: "extra", hex: "#ffffff" });
  assert.throws(() => readProject(file(doc)));
});

test("legacy and shaped yokes preserve colour 20 in saved files", () => {
  const sample = tutorialExampleDocument("tidal-fish-yoke")!.document.yoke!;
  const initial = {
    ...sample,
    version: 1 as const,
    program: undefined,
    palette: colours,
  };
  const legacy = paintYoke(initial, 0, 0, 19, false);
  const shaped = paintYoke(
    withYokeProgram(initial, yokeProgramFromProject(initial)),
    0,
    0,
    19,
    false,
  );
  for (const project of [legacy, shaped]) {
    const restored = readProject(file(yokeDocument(project)));
    assert.equal(restored.yoke?.cells[0][0], 19);
    assert.equal(restored.palette[19].hex, colours[19]);
    assert.equal(restored.yoke?.version, project.version);
  }
});
