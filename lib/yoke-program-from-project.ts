import { yokeChart } from "./yoke-chart";
import type { YokeProject } from "./yoke-project";
import type { YokeStitchProgram } from "./yoke-stitch-program";
import { resolveYokeProgram } from "./yoke-stitch-program";

export function yokeProgramFromProject(
  project: YokeProject,
): YokeStitchProgram {
  if (project.program) return structuredClone(project.program);
  const { document, maps } = yokeChart(project);
  const repeats = project.measurements.repeats;
  let serial = 0;
  const program: YokeStitchProgram = {
    revision: 0,
    startingCounts: Array<number>(repeats).fill(
      project.cells[0].length / repeats,
    ),
    rounds: project.cells.map((row, round) => {
      const width = row.length / repeats;
      return Array.from({ length: repeats }, (_, section) =>
        Array.from({ length: width }, (_, column) => ({
          id: `p${(serial++).toString(36)}`,
          action:
            document.stitchActions![project.cells.length - 1 - round][
              maps[round][column]
            ],
          color: row[section * width + column],
        })),
      );
    }),
  };
  resolveYokeProgram(program);
  return program;
}
