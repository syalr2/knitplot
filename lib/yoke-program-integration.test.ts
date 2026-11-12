import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultYokeMeasurements as m,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "./yoke-plan";
import {
  createYokeProject,
  yokeProjectSchema,
  paintYoke,
} from "./yoke-project";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import {
  resolvedYokeProgram,
  withYokeProgram,
  yokeRepeatWidths,
} from "./yoke-program-state";
import { reviseYokeStitches } from "./yoke-stitch-revision";
import { yokeChart } from "./yoke-chart";
import {
  yokeProgramSurface,
  yokeProgramGeometry,
} from "./yoke-program-surface";
import { yokeCellAt } from "./yoke-layout";
import { yokeDocument } from "./yoke-document";
import { readChartDocument } from "./chart-schema";
import { readProject } from "./project-file";
import { newChartTab, workspaceSave, readWorkspace } from "./workspace";
import { rowStitchMath, type StitchAction } from "./chart";
import {
  yokeDrawing,
  editYokeSelection,
  fillYoke,
  copyYokeRepeat,
} from "./yoke-editing";
const make = () =>
  createYokeProject(m, suggestYokeSchedule(calculateYokeTargets(m), m.repeats));
function revised(action: StitchAction) {
  const source = make(),
    p = yokeProgramFromProject(source),
    r = p.rounds.length - 1;
  return withYokeProgram(
    source,
    reviseYokeStitches(p, [
      { round: r, section: 0, operation: p.rounds[r][0][2].id, action },
    ]),
  );
}
for (const action of [
  "m1l",
  "m1r",
  "ssk",
  "k2tog",
  "cdd",
  "kfb",
  "inc",
  "dec",
  "purl",
  "no-stitch",
  "cast-on",
  "bind-off",
] as const)
  test(`${action}: revised yokes validate and roundtrip through files, workspace, chart projection and count math`, () => {
    const project = revised(action),
      doc = yokeDocument(project);
    assert.equal(yokeProjectSchema.safeParse(project).success, true);
    assert.doesNotThrow(() => readChartDocument(doc));
    const opened = readProject(
      JSON.parse(
        JSON.stringify({
          format: "colorwork-chart",
          version: 2,
          document: doc,
        }),
      ),
    );
    assert.deepEqual(opened.yoke, project);
    assert.deepEqual(
      readWorkspace(workspaceSave([newChartTab(doc, "test")], "test")).workspace
        .tabs[0].document.yoke,
      project,
    );
    const widths = yokeRepeatWidths(project),
      math = rowStitchMath(doc, project.cells.length);
    assert.equal(math.endingStitches, widths.at(-1)![0]);
    assert.equal(math.startingStitches, widths.at(-2)![0]);
  });

test("custom yoke validation rejects stale cells, missing instructions and a downgraded version", () => {
  const project = revised("ssk");
  assert.equal(
    yokeProjectSchema.safeParse({ ...project, cells: make().cells }).success,
    false,
  );
  assert.equal(
    yokeProjectSchema.safeParse({ ...project, program: undefined }).success,
    false,
  );
  assert.equal(
    yokeProjectSchema.safeParse({ ...project, version: 1 }).success,
    false,
  );
  const document = yokeDocument(project);
  assert.throws(() =>
    readChartDocument({
      ...document,
      stitchActions: make().cells.map((row) => row.map(() => "knit")),
    }),
  );
});

test("older yoke documents with an empty legacy stitch palette remain readable", () => {
  const project = make(),
    document = { ...yokeDocument(project), stitchPalette: [] };
  assert.doesNotThrow(() => readChartDocument(document));
  const wrong = {
    ...document,
    cells: document.cells.map((row) => row.map(() => "missing")),
  };
  assert.throws(() => readChartDocument(wrong));
});

test("unequal repeats map exactly between chart columns, real output cells and all curved views", () => {
  const project = revised("ssk"),
    drawing = yokeDrawing(project, null),
    surface = yokeProgramSurface(project);
  project.cells.forEach((row, r) =>
    row.forEach((_, c) => {
      const cell = drawing.chartCell(r, c);
      assert.deepEqual(drawing.yokeCell(cell.row, cell.column), {
        row: r,
        column: c,
      });
    }),
  );
  for (const view of ["repeat", "whole", "front", "back"] as const) {
    const g = yokeProgramGeometry(project, view, 0),
      counts = surface.rows.map((row) => row.length);
    const r = counts.length - 1;
    for (let c = 0; c < g.shownCounts[r]; c++) {
      const angle =
          g.rowAngles[r] + ((c + 0.5) / g.shownCounts[r]) * g.rowArcs[r],
        radius = g.inner + (r + 0.5) * g.radialHeight;
      assert.deepEqual(
        yokeCellAt(
          counts,
          m.repeats,
          view,
          1.4,
          g.cx + Math.cos(angle) * radius,
          g.cy + Math.sin(angle) * radius,
          g,
        ),
        { row: r, column: (c + g.columnOffsets[r]) % counts[r] },
      );
    }
  }
});

test("custom yarn painting, selection fills, region fills and colour copying retain instructions", () => {
  const project = revised("ssk"),
    actions = JSON.stringify(
      project.program!.rounds.map((row) =>
        row.map((ops) => ops.map((op) => op.action)),
      ),
    );
  for (const next of [
    paintYoke(project, 0, 1, 2, true),
    fillYoke(project, yokeDrawing(project, 0), 0, 1, 2, false, false),
    editYokeSelection(
      project,
      yokeDrawing(project, 0),
      { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 },
      { type: "fill-yarn", color: "yarn-2" },
      false,
    ).project,
    copyYokeRepeat(project, 0),
  ]) {
    assert.doesNotThrow(() => readChartDocument(yokeDocument(next)));
    assert.equal(
      JSON.stringify(
        next.program!.rounds.map((row) =>
          row.map((ops) => ops.map((op) => op.action)),
        ),
      ),
      actions,
    );
  }
});

test("bind-off openings remain real gaps; cast-on can close them without overwriting BO instructions", () => {
  const project = revised("bind-off"),
    surface = yokeProgramSurface(project),
    r = project.cells.length - 1;
  assert.equal(surface.rows[r].filter((slot) => slot.gap).length, 1);
  const p = project.program!,
    op = p.rounds[r][0][3];
  assert.ok(op);
  const next = withYokeProgram(
    project,
    reviseYokeStitches(p, [
      { round: r, section: 0, operation: op.id, action: "cast-on" },
    ]),
  );
  assert.equal(
    yokeProgramSurface(next).rows[r].filter((slot) => slot.gap).length,
    0,
  );
  const doc = yokeChart(next).document;
  assert.ok(doc.stitchActions![0].includes("bind-off"));
  assert.ok(doc.stitchActions![0].includes("cast-on"));
  assert.equal(
    rowStitchMath(doc, r + 1).startingStitches,
    yokeRepeatWidths(next)[r - 1][0],
  );
  assert.equal(
    rowStitchMath(doc, r + 1).endingStitches,
    yokeRepeatWidths(next)[r][0],
  );
  assert.ok(resolvedYokeProgram(next.program!).at(-1)!.sections[0].length);
});
