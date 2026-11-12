import { cloneDocument, defaultDocument, type StitchAction } from "./chart";
import type { YokeProject } from "./yoke-project";
import { resolvedYokeProgram } from "./yoke-program-state";
import type { YokeStitchProgram } from "./yoke-stitch-program";
import { yokeRepeatNumber } from "./yoke-repeat-labels";
import {
  isMirroredYokeSection,
  mirrorStitchAction,
  yokeProjectionProgram,
} from "./yoke-mirror";

/** Stable chart columns follow loop ancestry, not just the live stitch count. */
function yokeProgramColumns(program: YokeStitchProgram, section: number) {
  const rounds = resolvedYokeProgram(program),
    height = rounds.length;
  const order = Array.from(
    { length: program.startingCounts[section] },
    (_, index) => `seed-${section}-${index}`,
  );
  const families = new Map(order.map((id) => [id, id]));
  const outputs: string[][] = [],
    positions: Map<string, string>[] = [];
  const boundOff = new Set<string>();
  const openings: Set<string>[] = [];
  function insert(family: string, left?: string, right?: string) {
    if (order.includes(family)) return;
    const rightAt = right ? order.indexOf(right) : -1,
      leftAt = left ? order.indexOf(left) : -1;
    order.splice(
      rightAt >= 0 ? rightAt : leftAt >= 0 ? leftAt + 1 : order.length,
      0,
      family,
    );
  }
  rounds.forEach((round, r) => {
    const opPositions = new Map<string, string>();
    for (const op of round.operations[section]) {
      const parents = op.inputs
        .map((id) => families.get(id))
        .filter((id): id is string => !!id);
      let primary =
        parents[
          op.action === "k2tog"
            ? parents.length - 1
            : op.action === "cdd"
              ? Math.floor(parents.length / 2)
              : 0
        ];
      const left = op.left ? families.get(op.left) : undefined,
        right = op.right ? families.get(op.right) : undefined;
      if (op.action === "cast-on") {
        const leftAt = left ? order.indexOf(left) : -1,
          rightAt = right ? order.indexOf(right) : order.length;
        const closed = order
          .slice(Math.max(0, leftAt), rightAt < 0 ? order.length : rightAt)
          .find((family) => boundOff.has(family));
        if (closed) boundOff.delete(closed);
      }
      if (!primary) {
        primary = `new-${op.id}`;
        insert(primary, left, right);
      }
      opPositions.set(op.id, primary);
      op.outputs.forEach((id, index) => {
        const family = index === 0 ? primary! : `split-${id}`;
        if (index > 0) insert(family, primary, right);
        families.set(id, family);
      });
      if (op.action === "bind-off")
        parents.forEach((family) => boundOff.add(family));
    }
    outputs[r] = round.sections[section].map((loop) => families.get(loop.id)!);
    positions[r] = opPositions;
    openings[r] = new Set(boundOff);
  });
  if (order.length > 200)
    throw new Error(
      `Repeat ${yokeRepeatNumber(section, program.startingCounts.length)} needs ${order.length} chart columns; the limit is 200.`,
    );
  return { order, outputs, positions, openings, rounds, height };
}

export function validateYokeRepeatColumns(program: YokeStitchProgram) {
  const source = yokeProjectionProgram(program);
  for (let section = 0; section < program.startingCounts.length; section++)
    yokeProgramColumns(source, section);
}

/** Removed decrease columns become placeholders; only bind-off columns
 * remain openings in the fabric surface. */
export function yokeProgramChart(project: YokeProject, section = 0) {
  if (!project.program) throw new Error("Missing yoke instructions.");
  const { program } = project;
  const source = yokeProjectionProgram(program);
  if (!isMirroredYokeSection(program, section))
    return projectProgramChart(project, source, section);

  // A split has a persistent parent column. Reversing work alone would still
  // put its new loop on the original side; reflect the column projection too.
  const original = projectProgramChart(project, source, section);
  const { document, maps, operationMaps, surface } = original;
  const reflect = (column: number) => document.width - 1 - column;
  return {
    document: {
      ...document,
      cells: document.cells.map((row) => [...row].reverse()),
      stitchActions: document.stitchActions.map((row) =>
        [...row].reverse().map(mirrorStitchAction),
      ),
      stitchCellColors: document.stitchCellColors.map((row) =>
        [...row].reverse(),
      ),
    },
    maps: maps.map((row) => [...row].reverse().map(reflect)),
    operationMaps: operationMaps.map(
      (row) => new Map([...row].map(([column, id]) => [reflect(column), id])),
    ),
    surface: surface.map((row, round) =>
      [...row].reverse().map((slot) => ({
        ...slot,
        column: reflect(slot.column),
        loop: slot.loop < 0 ? -1 : maps[round].length - 1 - slot.loop,
      })),
    ),
  };
}

function projectProgramChart(
  project: YokeProject,
  program: YokeStitchProgram,
  section: number,
) {
  const { order, outputs, positions, openings, rounds, height } =
    yokeProgramColumns(program, section);
  const width = Math.max(1, order.length),
    index = new Map(order.map((family, c) => [family, c]));
  const cells = Array.from({ length: height }, () =>
    Array<string>(width).fill("yarn-0"),
  );
  const actions = Array.from({ length: height }, () =>
    Array<StitchAction>(width).fill("no-stitch"),
  );
  const display = Array.from({ length: height }, () =>
    Array<string | null>(width).fill(null),
  );
  const operationMaps: Map<number, string>[] = Array.from(
    { length: height },
    () => new Map(),
  );
  const maps = outputs.map((row) => row.map((family) => index.get(family)!));
  rounds.forEach((round, r) => {
    const chartRow = height - 1 - r;
    round.operations[section].forEach((op) => {
      const column = index.get(positions[r].get(op.id)!)!;
      cells[chartRow][column] = `yarn-${op.color}`;
      actions[chartRow][column] = op.action;
      display[chartRow][column] =
        op.displayColor === "yarn"
          ? project.palette[op.color]
          : (op.displayColor ?? null);
      operationMaps[r].set(column, op.id);
    });
    // Both loops from a split remain targetable through the chart.
    round.sections[section].forEach((loop, c) => {
      if (!operationMaps[r].has(maps[r][c]))
        operationMaps[r].set(maps[r][c], loop.operation);
    });
  });
  const document = {
    ...cloneDocument(defaultDocument),
    name: "Yoke repeat",
    width,
    height,
    cells,
    stitchActions: actions,
    stitchCellColors: display,
    palette: project.palette.map((hex, c) => ({ id: `yarn-${c}`, hex })),
    gaugeStitches: project.measurements.gaugeStitches,
    gaugeRows: project.measurements.gaugeRows,
    gaugeMeasure: project.measurements.gaugeMeasure,
    gaugeUnit: project.measurements.unit,
    stitchPalette: project.stitchPalette,
    stitchColors: project.stitchColors,
    instructions: {
      ...defaultDocument.instructions,
      construction: "round" as const,
      patternUse: "repeat" as const,
    },
    guides: {
      ...defaultDocument.guides,
      repeatWidth: width,
      repeatHeight: height,
    },
  };
  const surface = outputs.map((row, r) => {
    const live = new Map(row.map((family, c) => [family, c]));
    return order.flatMap((family, column) => {
      const loop = live.get(family);
      if (loop !== undefined)
        return [
          {
            column,
            loop,
            gap: false,
            operation: rounds[r].sections[section][loop].operation,
          },
        ];
      if (openings[r].has(family))
        return [
          {
            column,
            loop: -1,
            gap: true,
            operation: [...positions[r]].find(([, key]) => key === family)?.[0],
          },
        ];
      return [];
    });
  });
  return { document, maps, operationMaps, surface };
}
