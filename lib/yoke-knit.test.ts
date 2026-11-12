import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveYokeKnitStep,
  moveYokeKnitPage,
  yokeKnitModel,
  yokeKnitPages,
  yokeKnitSection,
  yokeWrittenRounds,
} from "./yoke-knit";
import { rowSequence } from "./knit-sequence";
import { asymmetricYoke, wideYoke } from "./yoke-test-fixtures";
import { createYokeProject, paintYoke } from "./yoke-project";
import {
  calculateYokeTargets,
  defaultYokeMeasurements as m,
  suggestYokeSchedule,
} from "./yoke-plan";
import { withYokeProgram } from "./yoke-program-state";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { reviseYokeStitches } from "./yoke-stitch-revision";
import { yokeDocument } from "./yoke-document";
import { readWorkspace, newChartTab, workspaceSave } from "./workspace";
import { readCloudChartPayload } from "./cloud-charts";

const plain = () =>
  createYokeProject(m, suggestYokeSchedule(calculateYokeTargets(m), m.repeats));

test("written rounds show one identical repeat and count the entire round", () => {
  const project = plain();
  const written = yokeWrittenRounds(project);
  assert.equal(written.repeatCount, m.repeats);
  assert.equal(
    written.rounds[0].sequence,
    `MC ${project.cells[0].length / m.repeats}`,
  );
  assert.equal(written.rounds[0].endingStitches, project.cells[0].length);
  assert.ok(
    written.rounds.some(
      (round) => round.change > 0 && round.sequence.split(", ").includes("M1L"),
    ),
  );
});

test("non-repeating written rounds combine Knit Mode's sections into one continuous sequence", () => {
  const { project } = asymmetricYoke;
  const model = yokeKnitModel(project);
  const pages = yokeKnitPages(project, model, 50);
  const written = yokeWrittenRounds(project);
  assert.equal(written.repeatCount, 1);
  assert.ok(pages.length > 1);
  for (const [r, round] of written.rounds.entries()) {
    assert.deepEqual(
      round.sequence,
      rowSequence(
        pages[0].document,
        pages.flatMap(({ rows }) => rows[r].steps),
        true,
      )
        .map(({ label, count, showCount }) =>
          showCount ? `${label} ${count}` : label,
        )
        .join(", "),
    );
    assert.equal(round.endingStitches, model.rounds[r].endingStitches);
  }
});

test("yoke stitch notation leaves main colour bare and puts contrast colour in parentheses", () => {
  const document = yokeKnitSection(plain(), yokeKnitModel(plain()), 0).document;
  const steps = document.palette.map(({ id }, column) => ({
    colorId: id,
    column,
    action: "m1l" as const,
  }));
  assert.ok(steps.length > 1);
  assert.deepEqual(
    rowSequence(document, steps, true).map(({ label }) => label),
    steps.map((_, i) => (i === 0 ? "M1L" : `M1L(CC${i})`)),
  );
});

test("repeated colours and shaping collapse to one repeat; either difference exposes all sections", () => {
  const project = plain();
  assert.equal(yokeKnitModel(project).sectionCount, 1);
  const painted = paintYoke(project, 0, 0, 1, false);
  assert.equal(yokeKnitModel(painted).sectionCount, m.repeats);
  const program = yokeProgramFromProject(project);
  assert.equal(
    yokeKnitModel(withYokeProgram(project, program)).sectionCount,
    1,
  );
  const round = project.events[0].round - 1;
  const op = program.rounds[round][1].find(
    (candidate) => candidate.action === "m1l",
  )!;
  op.action = "m1r";
  assert.equal(
    yokeKnitModel(withYokeProgram(project, program)).sectionCount,
    m.repeats,
  );
});

test("a split is one worked step and the displayed stitch math covers the full round", () => {
  const project = plain();
  const program = yokeProgramFromProject(project);
  const round = program.rounds.length - 1;
  const operation = program.rounds[round][1][2].id;
  const revised = withYokeProgram(
    project,
    reviseYokeStitches(program, [
      { round, section: 1, operation, action: "kfb" },
    ]),
  );
  const model = yokeKnitModel(revised);
  const section = yokeKnitSection(revised, model, 1);
  assert.equal(
    section.rows[round].steps.length,
    model.rounds[round].lengths[1],
  );
  assert.equal(
    section.rows[round].steps.filter((step) => step.action === "kfb").length,
    1,
  );
  assert.equal(
    model.rounds[round].startingStitches,
    project.cells[round - 1].length,
  );
  assert.equal(
    model.rounds[round].endingStitches,
    project.cells[round].length + 1,
  );
  const pages = yokeKnitPages(revised, model, 25);
  const visible = pages.flatMap((page) => page.rows[round].steps);
  assert.equal(visible.filter((step) => step.action === "kfb").length, 1);
  const ids = visible.map((step) => `${step.sourceSection}:${step.sourceStep}`);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    ids.length,
    model.rounds[round].lengths.reduce((a, b) => a + b, 0),
  );
});

test("step navigation crosses sections, skips empty sections, and crosses rounds in both directions", () => {
  const rounds = [
    { lengths: [3, 0, 2], startingStitches: 5, endingStitches: 5, change: 0 },
    { lengths: [2, 1, 1], startingStitches: 5, endingStitches: 4, change: -1 },
  ];
  const position = { row: 1, section: 0, stitch: 3 };
  const next = moveYokeKnitStep(rounds, 3, position, 1);
  assert.deepEqual(next, { row: 1, section: 2, stitch: 1 });
  assert.deepEqual(moveYokeKnitStep(rounds, 3, next, -1), position);
  const end = { ...next, stitch: 2 };
  const following = moveYokeKnitStep(rounds, 3, end, 1);
  assert.deepEqual(following, { row: 2, section: 0, stitch: 0 });
  assert.deepEqual(moveYokeKnitStep(rounds, 3, following, -1), end);
});

test("section progress survives browser and cloud validation", () => {
  const document = yokeDocument(plain());
  const tab = newChartTab(document, "yoke");
  tab.knitProgress = {
    ...tab.knitProgress,
    row: 3,
    section: 8,
    stitch: 5,
    viewSection: 16,
    sectionColumns: 50,
    shortRowNoteSeen: true,
  };
  assert.deepEqual(
    readWorkspace(workspaceSave([tab], tab.id)).workspace.tabs[0].knitProgress,
    tab.knitProgress,
  );
  assert.deepEqual(readCloudChartPayload(tab).knitProgress, tab.knitProgress);
});

test("100-column cuts are fixed and partition all worked instructions without loss or duplication", () => {
  const project = paintYoke(wideYoke.project, 0, 0, 1, false);
  const model = yokeKnitModel(project);
  const pages = yokeKnitPages(project, model);
  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((page) => [page.start, page.end]),
    [
      [0, 88],
      [88, 175],
      [175, 262],
    ],
  );
  for (let section = 0; section < model.sectionCount; section++) {
    const source = yokeKnitSection(project, model, section);
    for (let row = 0; row < source.rows.length; row++) {
      const reconstructed = pages.flatMap((page) =>
        page.rows[row].steps
          .filter((step) => step.sourceSection === section)
          .map(({ sourceStep, column, action, colorId }) => {
            assert.equal(
              source.rows[row].steps[sourceStep - 1].column,
              column + page.start - section * 131,
            );
            return { action, colorId };
          }),
      );
      assert.deepEqual(
        reconstructed,
        source.rows[row].steps.map(({ action, colorId }) => ({
          action,
          colorId,
        })),
      );
    }
  }
  assert.ok(
    yokeKnitPages(project, model, 50).every(
      (page) => page.document.width <= 50,
    ),
  );
  const repeat = wideYoke.project;
  const repeating = yokeKnitPages(repeat, yokeKnitModel(repeat));
  assert.deepEqual(
    repeating.map((page) => page.document.width),
    [66, 65],
  );
});

test("main navigation skips empty panels and changes round only after the last active panel", () => {
  const lengths = [
    [3, 0, 2, 0],
    [0, 4, 0, 2],
  ];
  assert.deepEqual(moveYokeKnitPage(lengths, 1, 0, 1), { row: 1, section: 2 });
  assert.deepEqual(moveYokeKnitPage(lengths, 1, 2, 1), { row: 2, section: 1 });
  assert.deepEqual(moveYokeKnitPage(lengths, 2, 1, -1), { row: 1, section: 2 });
  assert.deepEqual(moveYokeKnitPage(lengths, 2, 3, 1), { row: 2, section: 3 });
});
