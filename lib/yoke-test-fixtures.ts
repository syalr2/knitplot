import { yokeDocument } from "./yoke-document";
import {
  calculateYokeTargets,
  defaultYokeMeasurements,
  suggestYokeSchedule,
  type YokeMeasurements,
} from "./yoke-plan";
import { createYokeProject, type YokeProject } from "./yoke-project";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";
import { reviseYokeStitches } from "./yoke-stitch-revision";

// Synthetic test data only; no pattern or gallery charts.
export function makeYokeFixture(overrides: Partial<YokeMeasurements> = {}) {
  const input = { ...defaultYokeMeasurements, ...overrides };
  return createYokeProject(
    input,
    suggestYokeSchedule(calculateYokeTargets(input), input.repeats),
  );
}

function fixture(project: YokeProject, name: string) {
  return { project, document: yokeDocument(project, name) };
}

const asymmetric = makeYokeFixture({
  gaugeStitches: 28,
  gaugeRows: 38,
  neck: 42,
  depth: 23,
  backRise: 3,
});
asymmetric.shortRows = { distances: [30, 34, 38, 42, 46, 50] };
asymmetric.cells = asymmetric.cells.map((row, round) =>
  row.map((_, column) =>
    round > 5 && column < row.length / 5 && (column + round) % 3 === 0 ? 1 : 0,
  ),
);
export const asymmetricYoke = fixture(asymmetric, "Asymmetric test yoke");

export const wideYoke = fixture(
  makeYokeFixture({
    measurementMode: "finished",
    chest: 84,
    upperArm: 30.5,
    underarm: 3.5,
    neck: 60,
    depth: 19,
    gaugeRows: 26,
    repeats: 2,
    backRise: 0,
  }),
  "Wide test yoke",
);

const mixed = makeYokeFixture({ backRise: 0 });
const program = yokeProgramFromProject(mixed);
const round = program.rounds.length - 12;
export const mixedYoke = fixture(
  withYokeProgram(
    mixed,
    reviseYokeStitches(
      program,
      (["kfb", "ssk", "purl"] as const).map((action, section) => ({
        round,
        section,
        action,
        operation: program.rounds[round][section].find(
          (op) => op.action === "knit",
        )!.id,
      })),
    ),
  ),
  "Mixed-action test yoke",
);
