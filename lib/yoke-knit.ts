import { rowStitchSteps, stitchActionMath } from "./chart";
import { yokeChart } from "./yoke-chart";
import { rowSequence } from "./knit-sequence";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import type { YokeProject } from "./yoke-project";

export function yokeKnitModel(project: YokeProject) {
  const program = project.program ?? yokeProgramFromProject(project);
  const identical =
    program.startingCounts.every(
      (count) => count === program.startingCounts[0],
    ) &&
    program.rounds.every(([first, ...others]) =>
      others.every(
        (section) =>
          section.length === first.length &&
          section.every(
            (op, i) =>
              op.action === first[i].action && op.color === first[i].color,
          ),
      ),
    );
  const rounds = program.rounds.map((sections) => {
    let startingStitches = 0;
    let endingStitches = 0;
    const lengths = sections.map((section) => {
      let length = 0;
      for (const op of section) {
        if (op.action === "no-stitch") continue;
        length++;
        const math = stitchActionMath(op.action);
        startingStitches += math.consumes;
        endingStitches += math.produces;
      }
      return length;
    });
    return {
      lengths,
      startingStitches,
      endingStitches,
      change: endingStitches - startingStitches,
    };
  });
  return {
    program,
    identical,
    rounds,
    sectionCount: identical ? 1 : program.startingCounts.length,
  };
}

export function yokeKnitSection(
  project: YokeProject,
  model: ReturnType<typeof yokeKnitModel>,
  section: number,
) {
  const chart = yokeChart(project, section);
  const rows = model.program.rounds.map((round, r) => {
    const operations = chart.operationMaps?.[r];
    if (!operations) {
      const steps = rowStitchSteps(chart.document, r + 1);
      return {
        steps,
        atColumn: new Map(steps.map((step, i) => [step.column, i + 1])),
      };
    }
    // Some actions create two chart cells but are worked once. Both columns
    // can select the same instruction; the marker uses its primary column.
    const primary = new Map<string, number>();
    for (const [column, id] of operations)
      if (!primary.has(id)) primary.set(id, column);
    const index = new Map<string, number>();
    const steps = round[section].flatMap((op) => {
      const column = primary.get(op.id);
      if (op.action === "no-stitch" || column === undefined) return [];
      index.set(op.id, index.size + 1);
      return [{ column, action: op.action, colorId: `yarn-${op.color}` }];
    });
    const atColumn = new Map<number, number>();
    for (const [column, id] of operations) {
      const step = index.get(id);
      if (step !== undefined) atColumn.set(column, step);
    }
    return { steps, atColumn };
  });
  return { document: chart.document, rows };
}

export function moveYokeKnitStep(
  rounds: ReturnType<typeof yokeKnitModel>["rounds"],
  sectionCount: number,
  position: { row: number; section: number; stitch: number },
  direction: -1 | 1,
) {
  let { row, section } = position;
  const { stitch } = position;
  const lengths = rounds[row - 1].lengths;
  if (direction > 0) {
    if (stitch < lengths[section]) return { row, section, stitch: stitch + 1 };
    while (++section < sectionCount)
      if (lengths[section]) return { row, section, stitch: 1 };
    if (row < rounds.length) return { row: row + 1, section: 0, stitch: 0 };
  } else {
    if (stitch > (section === 0 ? 0 : 1))
      return { row, section, stitch: stitch - 1 };
    while (--section >= 0)
      if (lengths[section]) return { row, section, stitch: lengths[section] };
    if (position.section > 0) return { row, section: 0, stitch: 0 };
    if (row > 1) {
      row--;
      section = sectionCount - 1;
      while (section > 0 && !rounds[row - 1].lengths[section]) section--;
      return { row, section, stitch: rounds[row - 1].lengths[section] };
    }
  }
  return position;
}

/** Fixed column cuts keep the same motif in the same panel on every round. */
export function yokeKnitPages(
  project: YokeProject,
  model: ReturnType<typeof yokeKnitModel>,
  columns = 100,
) {
  const limit = Math.max(25, Math.min(200, Math.round(columns)));
  const sources = Array.from({ length: model.sectionCount }, (_, section) =>
    yokeKnitSection(project, model, section),
  );
  const offsets: number[] = [];
  let width = 0;
  for (const source of sources) {
    offsets.push(width);
    width += source.document.width;
  }
  const base = sources[0].document;
  const full = {
    ...base,
    width,
    cells: base.cells.map((_, r) =>
      sources.flatMap((source) => source.document.cells[r]),
    ),
    stitchActions: base.cells.map((_, r) =>
      sources.flatMap((source) => source.document.stitchActions![r]),
    ),
    stitchCellColors: base.cells.map((_, r) =>
      sources.flatMap(
        (source) =>
          source.document.stitchCellColors?.[r] ??
          Array<string | null>(source.document.width).fill(null),
      ),
    ),
  };
  const rows = model.rounds.map((_, r) =>
    sources.flatMap((source, sourceSection) =>
      source.rows[r].steps.map((step, i) => ({
        ...step,
        column: step.column + offsets[sourceSection],
        sourceSection,
        sourceStep: i + 1,
      })),
    ),
  );
  const count = Math.ceil(width / limit);
  const size = Math.floor(width / count);
  const remainder = width % count;
  return Array.from({ length: count }, (_, page) => {
    const start = page * size + Math.min(page, remainder);
    const end = start + size + (page < remainder ? 1 : 0);
    return {
      start,
      end,
      document: {
        ...full,
        width: end - start,
        cells: full.cells.map((row) => row.slice(start, end)),
        stitchActions: full.stitchActions.map((row) => row.slice(start, end)),
        stitchCellColors: full.stitchCellColors.map((row) =>
          row.slice(start, end),
        ),
      },
      rows: rows.map((steps) => {
        const visible = steps.flatMap((step) =>
          step.column >= start && step.column < end
            ? [{ ...step, column: step.column - start }]
            : [],
        );
        return {
          steps: visible,
          atColumn: new Map(visible.map((step, i) => [step.column, i + 1])),
        };
      }),
    };
  });
}

/** Navigate panels without needing to move the stitch marker. */
export function moveYokeKnitPage(
  lengths: number[][],
  row: number,
  section: number,
  direction: -1 | 1,
) {
  let nextRow = row;
  let next = section + direction;
  while (nextRow >= 1 && nextRow <= lengths.length) {
    for (; next >= 0 && next < lengths[nextRow - 1].length; next += direction)
      if (lengths[nextRow - 1][next] > 0)
        return { row: nextRow, section: next };
    nextRow += direction;
    next = direction > 0 ? 0 : lengths[0].length - 1;
  }
  return { row, section };
}

export function yokeWrittenRounds(project: YokeProject) {
  const model = yokeKnitModel(project);
  const palette = project.palette.map((hex, i) => ({ hex, id: `yarn-${i}` }));
  return {
    repeatCount: model.identical ? model.program.startingCounts.length : 1,
    rounds: model.rounds.map(
      ({ startingStitches, endingStitches, change }, r) => ({
        number: r + 1,
        startingStitches,
        endingStitches,
        change,
        sequence: rowSequence(
          { palette, instructions: { technique: "stranded" } },
          model.program.rounds[r]
            .slice(0, model.sectionCount)
            .flatMap((ops) =>
              ops.flatMap(({ action, color }) =>
                action === "no-stitch"
                  ? []
                  : [{ action, colorId: `yarn-${color}` }],
              ),
            ),
          true,
        )
          .map((run) =>
            run.showCount ? `${run.label} ${run.count}` : run.label,
          )
          .join(", "),
      }),
    ),
  };
}
