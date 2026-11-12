import type { StitchAction } from "./chart";
import type { YokeStitchProgram } from "./yoke-stitch-program";
// Versioned codes: append new actions; never reorder existing entries.
const actions: StitchAction[] = [
  "knit",
  "purl",
  "no-stitch",
  "cast-on",
  "m1l",
  "m1r",
  "kfb",
  "inc",
  "ssk",
  "k2tog",
  "cdd",
  "dec",
  "bind-off",
];
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function decodeYokeProgram(value: unknown): unknown {
  if (!record(value) || value.encoding !== "knitplot-stitches-1") return value;
  if (!Array.isArray(value.rounds) || value.rounds.length > 150) return null;
  const rounds = [];
  for (const round of value.rounds) {
    if (!Array.isArray(round) || round.length > 40) return null;
    const sections = [];
    for (const section of round) {
      if (!Array.isArray(section) || section.length > 200) return null;
      const ops = [];
      for (const op of section) {
        if (
          !Array.isArray(op) ||
          op.length < 3 ||
          op.length > 4 ||
          !Number.isInteger(op[1]) ||
          !actions[op[1]]
        )
          return null;
        ops.push({
          id: op[0],
          action: actions[op[1]],
          color: op[2],
          ...(op.length === 4
            ? { displayColor: op[3] === 1 ? "yarn" : op[3] }
            : {}),
        });
      }
      sections.push(ops);
    }
    rounds.push(sections);
  }
  return {
    revision: value.revision,
    ...(value.mirrored !== undefined ? { mirrored: value.mirrored } : {}),
    ...(value.mirroredSections !== undefined
      ? { mirroredSections: value.mirroredSections }
      : {}),
    startingCounts: value.startingCounts,
    rounds,
  };
}
export function encodeYokeProgram(program: YokeStitchProgram) {
  return {
    encoding: "knitplot-stitches-1",
    revision: program.revision,
    ...(program.mirrored ? { mirrored: true } : {}),
    ...(program.mirroredSections?.length
      ? { mirroredSections: program.mirroredSections }
      : {}),
    startingCounts: program.startingCounts,
    rounds: program.rounds.map((round) =>
      round.map((ops) =>
        ops.map((op) => [
          op.id,
          actions.indexOf(op.action),
          op.color,
          ...(op.displayColor
            ? [op.displayColor === "yarn" ? 1 : op.displayColor]
            : []),
        ]),
      ),
    ),
  };
}
/** Shared file/browser/API serialization keeps large yokes inside upload limits.
 * Ordinary documents produce byte-for-byte identical JSON. */
export function stringifyKnitplot(value: unknown, space?: number) {
  return JSON.stringify(
    value,
    (key, item: unknown) =>
      key === "program" &&
      record(item) &&
      item.encoding === undefined &&
      Array.isArray(item.rounds) &&
      Array.isArray(item.startingCounts) &&
      typeof item.revision === "number"
        ? encodeYokeProgram(item as YokeStitchProgram)
        : item,
    space,
  );
}
