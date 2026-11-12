import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stringifyKnitplot,
  decodeYokeProgram,
  encodeYokeProgram,
} from "./yoke-program-wire";
import { yokeStitchProgramSchema } from "./yoke-stitch-program-schema";
import { defaultDocument } from "./chart";
import {
  defaultYokeMeasurements as m,
  calculateYokeTargets,
  suggestYokeSchedule,
  suggestIncreasePositions,
} from "./yoke-plan";
import { createYokeProject, yokeProjectSchema } from "./yoke-project";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";
import { yokeDocument } from "./yoke-document";
import { readProject } from "./project-file";
import { readCloudChartPayload } from "./cloud-charts";
import { saveCloudChart } from "./cloud-save";
import {
  newChartTab,
  readWorkspace,
  tabPayload,
  tabSnapshot,
  workspaceSave,
} from "./workspace";
import { reviseYokeStitches } from "./yoke-stitch-revision";
import { yokeWrittenRounds } from "./yoke-knit";

test("ordinary documents retain exactly the same serialization", () => {
  assert.equal(
    stringifyKnitplot(defaultDocument),
    JSON.stringify(defaultDocument),
  );
  assert.equal(
    stringifyKnitplot(defaultDocument, 2),
    JSON.stringify(defaultDocument, null, 2),
  );
});
test("compact program storage preserves stable IDs, yarn and individual symbol overrides", () => {
  const p = createYokeProject(
    m,
    suggestYokeSchedule(calculateYokeTargets(m), m.repeats),
  );
  const program = yokeProgramFromProject(p);
  program.rounds[0][0][0].displayColor = "yarn";
  const decoded = yokeStitchProgramSchema.parse(encodeYokeProgram(program));
  assert.deepEqual(decoded, program);
  const project = withYokeProgram(p, program),
    document = yokeDocument(project);
  const file = stringifyKnitplot({
    format: "colorwork-chart",
    version: 2,
    document,
  });
  assert.match(file, /knitplot-stitches-1/);
  assert.equal(stringifyKnitplot(JSON.parse(file)), file);
  assert.deepEqual(readProject(JSON.parse(file)).yoke, project);
  assert.deepEqual(
    readCloudChartPayload(JSON.parse(stringifyKnitplot({ document }))).document
      .yoke,
    project,
  );
});
test("unknown codes and oversized nested encodings are rejected before allocation", () => {
  assert.equal(
    decodeYokeProgram({
      encoding: "knitplot-stitches-1",
      rounds: [[[["id", 999, 0]]]],
    }),
    null,
  );
  assert.equal(
    decodeYokeProgram({
      encoding: "knitplot-stitches-1",
      rounds: Array(151).fill([]),
    }),
    null,
  );
  assert.equal(
    decodeYokeProgram({
      encoding: "knitplot-stitches-1",
      rounds: [Array(41).fill([])],
    }),
    null,
  );
});
test("compact cloud replies reconcile a lost save acknowledgement", async () => {
  const project = createYokeProject(
    m,
    suggestYokeSchedule(calculateYokeTargets(m), m.repeats),
  );
  const revised = withYokeProgram(project, yokeProgramFromProject(project));
  const payload = tabPayload(newChartTab(yokeDocument(revised), "compact"));
  const transport: typeof fetch = async (_url, init) => {
    if (init?.method === "PUT") {
      assert.match(String(init.body), /knitplot-stitches-1/);
      return Response.json({ error: "conflict" }, { status: 409 });
    }
    return new Response(stringifyKnitplot({ ...payload, version: 2 }), {
      headers: { "Content-Type": "application/json" },
    });
  };
  assert.equal(await saveCloudChart("id", payload, "1", transport), "2");
});
function wideYoke(depth: number) {
  const measurements = {
    ...m,
    neck: 400,
    chest: 400,
    bodyEase: 0,
    upperArm: 100,
    sleeveEase: 0,
    depth,
    repeats: 6,
  };
  const plan = calculateYokeTargets(measurements);
  const project = createYokeProject(measurements, [
    {
      round: 2,
      count: plan.end,
      placements: suggestIncreasePositions(plan.neck / 6, plan.end / 6),
      stitch: "m1l",
    },
  ]);
  return withYokeProgram(project, yokeProgramFromProject(project));
}

test("a near-maximum 1,170-stitch, 150-round yoke fits cloud upload and linked browser storage", () => {
  const revised = wideYoke(150 / (m.gaugeRows / m.gaugeMeasure));
  const data = stringifyKnitplot({ document: yokeDocument(revised) });
  assert.ok(
    Buffer.byteLength(data) < 4_000_000,
    `Upload is ${Buffer.byteLength(data)} bytes`,
  );
  assert.equal(
    readCloudChartPayload(JSON.parse(data)).document.yoke?.version,
    2,
  );
  const tab = newChartTab(yokeDocument(revised), "large-yoke");
  tab.cloudId = "a21d4c9a-1122-4234-8234-123456789abc";
  tab.cloudVersion = "1";
  tab.cloudSnapshot = tabSnapshot(tab);
  assert.match(tab.cloudSnapshot, /^sha256-v1:[0-9a-f]{64}$/);
  const saved = stringifyKnitplot(workspaceSave([tab], tab.id));
  assert.ok(Buffer.byteLength(saved) < 4_000_000);
  const reopened = readWorkspace(JSON.parse(saved)).workspace.tabs[0];
  assert.equal(reopened.cloudSnapshot, tabSnapshot(reopened));
  assert.deepEqual(reopened.document.yoke, revised);
});

test("validation rejects an overwide later repeat even when live counts fit; print uses worked stitches", () => {
  const project = wideYoke(8);
  const program = project.program!;
  const round = program.rounds.length - 1;
  const section = 1;
  const edits = [10, 11, 12, 13, 14, 15, 20, 22, 24, 26, 28, 30].map(
    (column, i) => ({
      round,
      section,
      operation: program.rounds[round][section][column].id,
      action: i < 6 ? ("kfb" as const) : ("ssk" as const),
    }),
  );
  const revised = withYokeProgram(project, reviseYokeStitches(program, edits));
  const parsed = yokeProjectSchema.safeParse(revised);
  assert.equal(parsed.success, false);
  assert.match(
    parsed.error!.issues[0].message,
    /Repeat 1 needs 201 chart columns/,
  );
  assert.throws(
    () => readCloudChartPayload({ document: yokeDocument(revised) }),
    /Repeat 1 needs 201 chart columns/,
  );
  const last = yokeWrittenRounds(revised).rounds.at(-1)!;
  assert.equal(last.startingStitches, 1170);
  assert.equal(last.endingStitches, 1170);
  assert.equal(
    last.sequence.split(", ").filter((op) => op.toLowerCase() === "kfb").length,
    6,
  );
  assert.equal(
    last.sequence.split(", ").filter((op) => op === "SSK").length,
    6,
  );
});
