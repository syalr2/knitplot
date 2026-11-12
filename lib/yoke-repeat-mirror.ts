import { reflectYokeSections } from "./yoke-mirror";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";
import type { YokeProject } from "./yoke-project";

export function mirrorYokeRepeat(
  project: YokeProject,
  repeat: number | readonly number[],
) {
  const program = project.program ?? yokeProgramFromProject(project);
  return withYokeProgram(
    project,
    reflectYokeSections(
      program,
      typeof repeat === "number" ? [repeat] : repeat,
      false,
    ),
  );
}
