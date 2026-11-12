import { yokeChart } from "./yoke-chart";
import { isMirroredYokeSection } from "./yoke-mirror";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";
import { repeatTargets, type YokeRepeatScope } from "./yoke-repeat-scope";
import { yokeRepeatNumber } from "./yoke-repeat-labels";
import type { YokeProject } from "./yoke-project";
import type { YokeOperation } from "./yoke-stitch-program";

export type ChartPoint = { row: number; column: number };
const isIncrease = (action: unknown): action is "m1l" | "m1r" =>
  action === "m1l" || action === "m1r";

/** A planned increase starts a new chart column. Only rebuild affected
 * repeats, keeping surviving yarn colours at their original chart positions. */
export function prepareYokeIncreaseMove(
  project: YokeProject,
  repeat: number,
  scope: YokeRepeatScope,
  from: ChartPoint,
) {
  const program = project.program ?? yokeProgramFromProject(project);
  const count = program.startingCounts.length;
  const sections = repeatTargets(scope, count, repeat);
  if (!sections.length)
    throw new Error("View a repeat in your edit selection.");
  const height = program.rounds.length;
  const revision = program.revision + 1;
  const sourceMirrored = isMirroredYokeSection(program, repeat);
  const sources = sections.map((section) => {
    const label = `Repeat ${yokeRepeatNumber(section, count)}`;
    const mirrored = isMirroredYokeSection(program, section);
    const { document, maps } = yokeChart(project, section);
    const columnAt = (column: number) =>
      mirrored === sourceMirrored ? column : document.width - 1 - column;
    const column = columnAt(from.column);
    const actions = document.stitchActions!;
    const action = actions[from.row]?.[column];
    if (!isIncrease(action))
      throw new Error(`${label} has no matching M1 at that position.`);
    if (
      program.rounds.some((row) =>
        row[section].some(
          (op) =>
            op.action !== "knit" &&
            op.action !== "purl" &&
            !isIncrease(op.action),
        ),
      )
    )
      throw new Error(
        `${label} has other shaping stitches. This tool currently moves increases in repeats with only knits, purls and M1s.`,
      );
    const birth = Array<number>(document.width).fill(0);
    const directions = new Map<number, "m1l" | "m1r">();
    actions.forEach((row, index) =>
      row.forEach((symbol, c) => {
        if (isIncrease(symbol)) {
          birth[c] = height - 1 - index;
          directions.set(c, symbol);
        }
      }),
    );
    const oldOps = maps.map(
      (columns, round) =>
        new Map(columns.map((c, i) => [c, program.rounds[round][section][i]])),
    );
    return {
      section,
      label,
      column,
      columnAt,
      birth,
      directions,
      action,
      oldOps,
    };
  });

  return (to: ChartPoint) => {
    if (to.row === from.row && to.column === from.column) return project;
    const endRound = height - 1 - to.row;
    if (endRound < 1 || endRound >= height)
      throw new Error("Choose a cell above the first round.");
    const rounds = program.rounds.map((round) => [...round]);
    for (const source of sources) {
      const { section, label, column, columnAt, oldOps, action } = source;
      const target = columnAt(to.column);
      if (target < 0 || target >= source.birth.length)
        throw new Error(`${label} has no column at that position.`);
      if (target !== column && source.birth[target] !== 0)
        throw new Error(`${label} already has an increase in that column.`);
      const birth = [...source.birth];
      const directions = new Map(source.directions);
      birth[column] = 0;
      directions.delete(column);
      birth[target] = endRound;
      directions.set(target, action);
      const moved = oldOps[height - 1 - from.row].get(column)!;
      rounds.forEach((round, r) => {
        const oldTarget = oldOps[r].get(target);
        const displacedPurl =
          r < endRound &&
          column !== target &&
          !oldOps[r].has(column) &&
          oldTarget?.action === "purl"
            ? oldTarget
            : undefined;
        if (r <= endRound && oldTarget?.action === "purl" && !displacedPurl)
          throw new Error(
            `Round ${r + 1}, ${label.toLowerCase()}: this move would remove a purl. Choose a different cell.`,
          );
        round[section] = birth.flatMap((firstRound, c): YokeOperation[] => {
          if (firstRound > r) return [];
          const old =
            oldOps[r].get(c) ?? (c === column ? displacedPurl : undefined);
          const donor =
            old ?? (c === column ? oldOps[r].get(target) : undefined);
          const isMoved = c === target && r === endRound;
          const displayColor = isMoved ? moved.displayColor : old?.displayColor;
          return [
            {
              id:
                old?.id ??
                `m${revision.toString(36)}.${r.toString(36)}.${section.toString(36)}.${c.toString(36)}`,
              action:
                firstRound > 0 && firstRound === r
                  ? directions.get(c)!
                  : old?.action === "purl"
                    ? "purl"
                    : "knit",
              color: donor?.color ?? (isMoved ? moved.color : 0),
              ...(displayColor ? { displayColor } : {}),
            },
          ];
        });
      });
    }
    const next = withYokeProgram(project, { ...program, revision, rounds });
    for (const { section, columnAt, action, label } of sources) {
      if (
        yokeChart(next, section).document.stitchActions?.[to.row]?.[
          columnAt(to.column)
        ] !== action
      )
        throw new Error(
          `${label}: the increase cannot be placed in that exact cell.`,
        );
    }
    return next;
  };
}
